/**
 * Actor Registry — People Resolution Engine
 *
 * Defines the actors in a case, their role, relationship to the user,
 * and whether they're in the reporting chain. When text is analyzed,
 * known actors are resolved by name/alias BEFORE falling back to
 * pattern-based detection in the categorizer.
 *
 * This replaces guessing harasser_role from prose patterns alone.
 *
 * Usage:
 *   const { ActorRegistry } = require('./actor-registry');
 *   const registry = ActorRegistry.fromDb(caseDb);
 *   const { role, inChain, actor } = registry.resolveRoleFromText(text);
 *   const matches = registry.findActorsInText(text);
 */

// ── Taxonomy ──────────────────────────────────────────────────────────────────

const RELATIONSHIP_TYPES = {
  direct_supervisor:  'Direct Supervisor (your boss)',
  skip_level:         'Skip-Level (boss\'s boss)',
  senior_leadership:  'Senior Leadership (above skip-level)',
  hr:                 'HR / People Ops',
  hr_investigator:    'HR Investigator',
  peer:               'Peer / Colleague (same level)',
  subordinate:        'Subordinate (reports to you)',
  union_rep:          'Union Representative',
  legal:              'Legal / Employment Counsel',
  witness:            'Witness',
  other:              'Other',
};

// Maps relationship type → harasser_role used by categorizer
const RELATIONSHIP_TO_HARASSER_ROLE = {
  direct_supervisor:  'supervisor',
  skip_level:         'senior_leadership',
  senior_leadership:  'senior_leadership',
  hr:                 'supervisor',
  hr_investigator:    'supervisor',
  peer:               'peer',
  subordinate:        'peer',
  union_rep:          'peer',
  legal:              'peer',
  witness:            'unknown',
  other:              'unknown',
  // Legacy values (pre-registry)
  supervisor:         'supervisor',
  executive:          'senior_leadership',
  direct_report:      'peer',
};

// Relationships that constitute "in the reporting chain"
const IN_CHAIN_RELATIONSHIPS = new Set([
  'direct_supervisor',
  'skip_level',
  'senior_leadership',
  // Legacy values (pre-registry) that also imply chain
  'supervisor',
  'executive',
]);

// ── Actor class ───────────────────────────────────────────────────────────────

class Actor {
  constructor({ id, name, aliases = [], title = '', relationship = 'other',
                inReportingChain = false, classification = 'unknown',
                email = '', department = '' }) {
    this.id = id;
    this.name = name;
    this.aliases = aliases;
    this.title = title;
    this.relationship = relationship;
    this.inReportingChain = inReportingChain;
    this.classification = classification;
    this.email = email;
    this.department = department;
  }

  get relationshipLabel() {
    return RELATIONSHIP_TYPES[this.relationship] || 'Other';
  }

  get harasserRole() {
    return RELATIONSHIP_TO_HARASSER_ROLE[this.relationship] || 'unknown';
  }

  /** All name forms this actor might appear as, lowercased. */
  get allNameForms() {
    const forms = [this.name.toLowerCase()];
    for (const alias of this.aliases) {
      const a = alias.trim().toLowerCase();
      if (a && !forms.includes(a)) forms.push(a);
    }
    return forms;
  }

  /** True if any name form appears as a word boundary match in text. */
  matchesText(text) {
    const lower = text.toLowerCase();
    for (const name of this.allNameForms) {
      if (name && wordBoundaryMatch(name, lower)) return true;
    }
    return false;
  }

  /**
   * Match confidence:
   *   0.0 = no match
   *   0.5 = single-word alias (ambiguous first name)
   *   0.85 = multi-word alias match
   *   1.0 = full display name match
   */
  matchConfidence(text) {
    const lower = text.toLowerCase();
    const full = this.name.toLowerCase();

    if (wordBoundaryMatch(full, lower)) return 1.0;

    for (const alias of this.aliases) {
      const a = alias.trim().toLowerCase();
      if (a && wordBoundaryMatch(a, lower)) {
        return a.split(/\s+/).length === 1 ? 0.5 : 0.85;
      }
    }
    return 0.0;
  }
}

// ── Match result ──────────────────────────────────────────────────────────────

class ActorMatch {
  constructor(actor, confidence, matchedOn) {
    this.actor = actor;
    this.confidence = confidence;
    this.matchedOn = matchedOn;
    this.needsConfirmation = confidence < 1.0;
  }
}

// ── Registry ──────────────────────────────────────────────────────────────────

class ActorRegistry {
  constructor(db) {
    this.db = db;
    this.actors = new Map(); // id -> Actor
  }

  /** Create a registry from an open case database. */
  static fromDb(db) {
    const registry = new ActorRegistry(db);
    registry._ensureColumns();
    registry.loadAll();
    return registry;
  }

  /** Add aliases and in_reporting_chain columns if they don't exist yet. */
  _ensureColumns() {
    const cols = this.db.prepare('PRAGMA table_info(actors)').all();
    const names = cols.map(c => c.name);

    if (!names.includes('aliases')) {
      this.db.exec("ALTER TABLE actors ADD COLUMN aliases TEXT DEFAULT '[]'");
    }
    const needsBackfill = !names.includes('in_reporting_chain');
    if (needsBackfill) {
      this.db.exec('ALTER TABLE actors ADD COLUMN in_reporting_chain INTEGER DEFAULT 0');

      // One-time backfill only when column is first added:
      // set in_reporting_chain for actors with chain-type relationships
      // that were created before the registry existed.
      // This does NOT run on every load, so manual corrections persist.
      const chainRelationships = Array.from(IN_CHAIN_RELATIONSHIPS);
      const placeholders = chainRelationships.map(() => '?').join(', ');
      this.db.prepare(
        `UPDATE actors SET in_reporting_chain = 1
         WHERE relationship_to_self IN (${placeholders})
         AND in_reporting_chain = 0`
      ).run(...chainRelationships);
    }
  }

  /** Load all actors from the database into memory. */
  loadAll() {
    this.actors.clear();
    const rows = this.db.prepare('SELECT * FROM actors').all();
    for (const row of rows) {
      let aliases = [];
      try { aliases = JSON.parse(row.aliases || '[]'); } catch (e) { /* ignore */ }
      const actor = new Actor({
        id: row.id,
        name: row.name,
        aliases,
        title: row.title || '',
        relationship: row.relationship_to_self || 'other',
        inReportingChain: !!row.in_reporting_chain,
        classification: row.classification || 'unknown',
        email: row.email || '',
        department: row.department || '',
      });
      this.actors.set(row.id, actor);
    }
  }

  /** Save aliases and in_reporting_chain for an actor. */
  saveActorRegistryFields(actorId, aliases, inReportingChain, relationship) {
    const updates = [];
    const values = [];

    if (aliases !== undefined) {
      updates.push('aliases = ?');
      values.push(JSON.stringify(aliases));
    }
    if (inReportingChain !== undefined) {
      updates.push('in_reporting_chain = ?');
      values.push(inReportingChain ? 1 : 0);
    }
    if (relationship !== undefined) {
      updates.push('relationship_to_self = ?');
      values.push(relationship);
    }

    if (updates.length === 0) return;

    values.push(actorId);
    this.db.prepare(
      'UPDATE actors SET ' + updates.join(', ') + ' WHERE id = ?'
    ).run(...values);

    // Refresh in-memory cache
    const actor = this.actors.get(actorId);
    if (actor) {
      if (aliases !== undefined) actor.aliases = aliases;
      if (inReportingChain !== undefined) actor.inReportingChain = inReportingChain;
      if (relationship !== undefined) actor.relationship = relationship;
    }
  }

  // ── Name resolution ───────────────────────────────────────────────────

  /**
   * Scan text for all known actors.
   * Returns sorted by confidence descending, deduplicated per actor.
   */
  findActorsInText(text) {
    const seen = new Map(); // actorId -> ActorMatch

    for (const actor of this.actors.values()) {
      const conf = actor.matchConfidence(text);
      if (conf > 0) {
        const matchedOn = findMatchedForm(actor, text);
        const match = new ActorMatch(actor, conf, matchedOn);
        const existing = seen.get(actor.id);
        if (!existing || conf > existing.confidence) {
          seen.set(actor.id, match);
        }
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Resolve harasser role from text using known actors.
   *
   * Priority:
   *   1. Confirmed actor IDs (from manual tagging)
   *   2. High-confidence auto-match (full name, conf=1.0)
   *   3. Falls back to { role: 'unknown', inChain: false, actor: null }
   *
   * Ambiguous matches are NOT auto-applied -- they need UI confirmation.
   */
  resolveRoleFromText(text, confirmedActorIds = null) {
    // Use confirmed actors first
    if (confirmedActorIds && confirmedActorIds.length > 0) {
      for (const actorId of confirmedActorIds) {
        const actor = this.actors.get(actorId);
        if (actor) {
          return { role: actor.harasserRole, inChain: actor.inReportingChain, actor };
        }
      }
    }

    // Auto-apply only high-confidence matches (full name match)
    const matches = this.findActorsInText(text);
    const certain = matches.filter(m => m.confidence === 1.0);

    if (certain.length > 0) {
      // If multiple certain matches, pick highest-severity role
      const ROLE_PRIORITY = { senior_leadership: 0, supervisor: 1, peer: 2, unknown: 3 };
      certain.sort((a, b) =>
        (ROLE_PRIORITY[a.actor.harasserRole] || 3) - (ROLE_PRIORITY[b.actor.harasserRole] || 3)
      );
      const best = certain[0];
      return { role: best.actor.harasserRole, inChain: best.actor.inReportingChain, actor: best.actor };
    }

    return { role: 'unknown', inChain: false, actor: null };
  }

  /**
   * Return ambiguous matches (confidence < 1.0) that need user confirmation.
   */
  getPendingConfirmations(text) {
    return this.findActorsInText(text).filter(m => m.needsConfirmation);
  }

  /** All actors in the reporting chain. */
  actorsInChain() {
    return Array.from(this.actors.values()).filter(a => a.inReportingChain);
  }

  /** All actors with a given relationship type. */
  actorsByRelationship(relationship) {
    return Array.from(this.actors.values()).filter(a => a.relationship === relationship);
  }

  /**
   * Auto-link known actors to a document by scanning its text.
   * Returns array of { actorId, confidence, matchedOn } for actors that
   * were found and linked.
   */
  autoLinkActorsToDocument(documentId, text) {
    const matches = this.findActorsInText(text);
    const linked = [];

    for (const match of matches) {
      if (match.confidence >= 0.85) {
        // Check if link already exists
        const existing = this.db.prepare(
          'SELECT 1 FROM actor_appearances WHERE actor_id = ? AND document_id = ?'
        ).get(match.actor.id, documentId);

        if (!existing) {
          try {
            this.db.prepare(
              'INSERT OR IGNORE INTO actor_appearances (actor_id, document_id, role_in_document, auto_detected, confidence) VALUES (?, ?, ?, 1, ?)'
            ).run(match.actor.id, documentId, match.actor.classification, match.confidence);
            linked.push({
              actorId: match.actor.id,
              actorName: match.actor.name,
              confidence: match.confidence,
              matchedOn: match.matchedOn,
            });
          } catch (e) {
            // FK violation: actor or document not in DB (stale registry) — skip silently
          }
        }
      }
    }

    return linked;
  }

  /**
   * Compact summary for injection into assessment/analysis prompts.
   */
  summaryForAssessment() {
    if (this.actors.size === 0) return 'No actors defined.';

    const lines = ['=== KNOWN ACTORS ==='];
    for (const a of this.actors.values()) {
      const chainFlag = a.inReportingChain ? ' [IN REPORTING CHAIN]' : '';
      const aliasStr = a.aliases.length > 0 ? ' | aliases: ' + a.aliases.join(', ') : '';
      lines.push(
        '  ' + a.name + ' (' + (a.title || 'no title') + ') -- ' + a.relationshipLabel + chainFlag + aliasStr
      );
    }
    return lines.join('\n');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundaryMatch(needle, haystack) {
  if (!needle) return false;
  const regex = new RegExp('\\b' + escapeRegex(needle) + '\\b');
  return regex.test(haystack);
}

function findMatchedForm(actor, text) {
  const lower = text.toLowerCase();
  for (const name of actor.allNameForms) {
    if (name && wordBoundaryMatch(name, lower)) return name;
  }
  return actor.name;
}

// ── Categorizer integration ──────────────────────────────────────────────────

/**
 * Drop-in enhancement for detectHarasserRole() in categorizer.js.
 *
 * If a registry is available, check known actors first. If an actor match
 * is found with high confidence, use their stored role. Otherwise falls
 * through to the pattern-based detection.
 *
 * Returns: { role, inChain, actor, pending }
 */
function resolveHarasserForEntry(text, registry, confirmedActorIds = null) {
  if (!registry || registry.actors.size === 0) {
    return { role: 'unknown', inChain: false, actor: null, pending: [] };
  }

  const { role, inChain, actor } = registry.resolveRoleFromText(text, confirmedActorIds);
  const pending = confirmedActorIds ? [] : registry.getPendingConfirmations(text);

  return { role, inChain, actor, pending };
}

module.exports = {
  ActorRegistry,
  Actor,
  ActorMatch,
  resolveHarasserForEntry,
  RELATIONSHIP_TYPES,
  RELATIONSHIP_TO_HARASSER_ROLE,
  IN_CHAIN_RELATIONSHIPS,
};
