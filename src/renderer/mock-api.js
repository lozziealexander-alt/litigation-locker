// Mock Electron preload API for browser preview

// Stateful actor store — updates persist during the browser session
const _mockActors = [
  { id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', secondary_classifications: '["enabler"]', role: 'Direct Supervisor', relationship_to_self: 'supervisor', appearance_count: 5, in_reporting_chain: 1, aliases: '["Jane M", "J. Manager"]' },
  { id: 'act-2', name: 'Tom HR', classification: 'enabler', secondary_classifications: null, role: 'HR Director', relationship_to_self: 'hr', appearance_count: 3, in_reporting_chain: 0, aliases: '[]' },
  { id: 'act-3', name: 'Sarah Coworker', classification: 'witness_supportive', secondary_classifications: '["corroborator"]', role: 'Colleague', relationship_to_self: 'peer', appearance_count: 1, in_reporting_chain: 0, aliases: '["Sarah C"]' },
  { id: 'act-4', name: 'Mike VP', classification: 'bad_actor', secondary_classifications: null, role: 'VP Operations', relationship_to_self: 'senior_leadership', appearance_count: 2, in_reporting_chain: 1, aliases: '["Mike", "Michael VP"]' },
  { id: 'act-self', name: 'You (Self)', classification: 'self', secondary_classifications: null, role: 'Senior Analyst', relationship_to_self: 'self', appearance_count: 6, is_self: 1, gender: 'female', disability_status: 'no', race: 'unknown', age_range: '40-49', in_reporting_chain: 0, aliases: '[]' }
];

window.api = {
  vault: {
    exists: () => Promise.resolve(true),
    setup: () => Promise.resolve({ success: true }),
    unlock: () => Promise.resolve({ success: true }),
    lock: () => Promise.resolve({ success: true }),
    isUnlocked: () => Promise.resolve(true)
  },
  burn: {
    execute: () => Promise.resolve({ success: true }),
    verify: () => Promise.resolve({ success: true })
  },
  cases: {
    list: () => Promise.resolve({ success: true, cases: [
      { id: 'case-1', name: 'Employment Dispute 2024', created_at: '2024-01-15' },
      { id: 'case-2', name: 'Retaliation Claim', created_at: '2024-03-01' }
    ]}),
    create: (name) => Promise.resolve({ success: true, case: { id: 'case-new', name } }),
    open: () => Promise.resolve({ success: true }),
    current: () => Promise.resolve({ caseId: 'case-1' })
  },
  documents: {
    ingest: () => Promise.resolve({ success: true, documents: [] }),
    list: () => Promise.resolve({ success: true, documents: [
      { id: 'doc-1', filename: 'Discrimination_Complaint.eml', evidence_type: 'PROTECTED_ACTIVITY', document_date: '2024-01-10', document_date_confidence: 'exact', file_type: 'message/rfc822', file_size: 15360, is_recap: 1, document_subtype: 'recap_self_doc' },
      { id: 'doc-3', filename: 'Performance_Review_Q1.pdf', evidence_type: 'ADVERSE_ACTION', document_date: '2024-01-24', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 102400, is_recap: 0 },
      { id: 'doc-5', filename: 'Written_Warning.pdf', evidence_type: 'ADVERSE_ACTION', document_date: '2024-02-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 245760, is_recap: 0 },
      { id: 'doc-6', filename: 'EEOC_Charge_Filed.pdf', evidence_type: 'PROTECTED_ACTIVITY', document_date: '2024-03-01', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 327680, is_recap: 0 },
      { id: 'doc-7', filename: 'Termination_Letter.pdf', evidence_type: 'ADVERSE_ACTION', document_date: '2024-03-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 184320, is_recap: 0 },
      { id: 'doc-8', filename: 'Pay_Stub_March.pdf', evidence_type: 'PAY_RECORD', document_date: '2024-03-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 40960, is_recap: 0 }
    ]}),
    get: (id) => Promise.resolve({ success: true, document: {
      id, filename: 'HR_Warning_Letter.pdf', file_type: 'application/pdf',
      file_size: 245760, evidence_type: 'ADVERSE_ACTION',
      document_date: '2024-02-15', document_date_confidence: 'exact',
      sha256_hash: 'abc123def456789012345678901234567890abcdef',
      extracted_text: 'This letter serves as a formal written warning regarding your performance. After multiple discussions about expectations and goals, we have not seen sufficient improvement in the areas discussed. This warning will be placed in your personnel file.',
      metadata_json: JSON.stringify({ from: 'hr@company.com', subject: 'Written Warning' }),
      content_dates_json: JSON.stringify([
        { text: 'February 15, 2024', date: '2024-02-15' },
        { text: 'January 10, 2024', date: '2024-01-10' },
        { text: 'December 1, 2023', date: '2023-12-01' }
      ])
    }}),
    updateContext: () => Promise.resolve({ success: true }),
    updateDate: () => Promise.resolve({ success: true }),
    updateType: () => Promise.resolve({ success: true }),
    rename: () => Promise.resolve({ success: true }),
    getContent: (docId) => {
      const previews = {
        'doc-1': { data: 'From: employee@company.com\nTo: hr@company.com\nSubject: Formal Complaint - Discriminatory Treatment\n\nDear HR,\n\nI am writing to formally report discriminatory treatment by my supervisor, Jane Manager. Over the past several months, I have experienced repeated age-related comments and been systematically excluded from key projects.', mimeType: 'text/plain' },
        'doc-5': { data: 'WRITTEN WARNING\n\nEmployee: [Name Redacted]\nDate: February 15, 2024\nSupervisor: Jane Manager\n\nThis letter serves as a formal written warning regarding your performance. After multiple discussions about expectations and goals, we have not seen sufficient improvement.', mimeType: 'text/plain' },
        'doc-6': { data: 'EEOC CHARGE OF DISCRIMINATION\n\nCharge No: 510-2024-XXXXX\nFiling Date: March 1, 2024\n\nI believe I have been discriminated against based on my age and gender, and retaliated against for filing an internal complaint.', mimeType: 'text/plain' },
        'doc-7': { data: 'NOTICE OF TERMINATION\n\nEffective Date: March 15, 2024\n\nDear [Employee],\n\nThis letter is to inform you that your employment with Acme Corp is being terminated effective immediately due to organizational restructuring.', mimeType: 'text/plain' },
      };
      const preview = previews[docId] || { data: 'Document content preview not available.', mimeType: 'text/plain' };
      return Promise.resolve({ success: true, ...preview });
    },
    reclassify: () => Promise.resolve({ success: true }),
    addDateEntry: () => Promise.resolve({ success: true }),
    removeDateEntry: () => Promise.resolve({ success: true }),
    getDateEntries: () => Promise.resolve({ success: true, entries: [] }),
    setGroup: () => Promise.resolve({ success: true }),
    removeGroup: () => Promise.resolve({ success: true }),
    updateRecapStatus: () => Promise.resolve({ success: true }),
    updateDocumentSubtype: () => Promise.resolve({ success: true }),
    delete: () => Promise.resolve({ success: true }),
    copy: (docId) => Promise.resolve({ success: true, document: { id: 'doc-copy', filename: 'Document (copy)' } })
  },
  timeline: {
    get: () => Promise.resolve({ success: true, dated: [
      { id: 'doc-1', filename: 'Discrimination_Complaint.eml', evidence_type: 'PROTECTED_ACTIVITY',
        document_date: '2024-01-10', document_date_confidence: 'exact', file_type: 'message/rfc822', file_size: 15360 },
      { id: 'doc-2', filename: 'HR_Response_Email.eml', evidence_type: 'RESPONSE',
        document_date: '2024-01-15', document_date_confidence: 'exact', file_type: 'message/rfc822', file_size: 8192 },
      { id: 'doc-3', filename: 'Performance_Review_Q1.pdf', evidence_type: 'ADVERSE_ACTION',
        document_date: '2024-01-24', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 102400 },
      { id: 'doc-4', filename: 'Coworker_Witness_Statement.pdf', evidence_type: 'SUPPORTING',
        document_date: '2024-01-24', document_date_confidence: 'approximate', file_type: 'application/pdf', file_size: 51200 },
      { id: 'doc-5', filename: 'Written_Warning.pdf', evidence_type: 'ADVERSE_ACTION',
        document_date: '2024-02-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 245760 },
      { id: 'doc-6', filename: 'EEOC_Charge_Filed.pdf', evidence_type: 'PROTECTED_ACTIVITY',
        document_date: '2024-03-01', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 327680 },
      { id: 'doc-7', filename: 'Termination_Letter.pdf', evidence_type: 'ADVERSE_ACTION',
        document_date: '2024-03-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 184320 },
      { id: 'doc-8', filename: 'Pay_Stub_March.pdf', evidence_type: 'PAY_RECORD',
        document_date: '2024-03-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 40960 }
    ], undated: [
      { id: 'doc-u1', filename: 'Office_Photo_1.jpg', evidence_type: 'CONTEXT', file_type: 'image/jpeg', file_size: 2048000 },
      { id: 'doc-u2', filename: 'Chat_Screenshot.png', evidence_type: 'INCIDENT', file_type: 'image/png', file_size: 512000 }
    ]}),
    getConnections: () => Promise.resolve({ success: true, connections: [
      { sourceId: 'doc-1', targetId: 'doc-3', connectionType: 'retaliation_chain', daysBetween: 14, strength: 'strong',
        description: '14 days after protected activity' },
      { sourceId: 'doc-1', targetId: 'doc-5', connectionType: 'retaliation_chain', daysBetween: 36, strength: 'moderate',
        description: '36 days after protected activity' },
      { sourceId: 'doc-6', targetId: 'doc-7', connectionType: 'retaliation_chain', daysBetween: 14, strength: 'strong',
        description: '14 days after protected activity' }
    ], escalation: { hasEscalation: true, escalations: 3, deescalations: 0, trend: 'escalating' }})
  },
  incidents: {
    list: () => Promise.resolve({ success: true, incidents: [
      { id: 'inc-1', title: 'Retaliation: Performance Review After Complaint', date: '2024-01-24', incident_type: 'retaliation', base_severity: 'severe', computed_severity: 'severe', description: 'Negative performance review after complaint', events: [{ event_id: 'anc-2', event_role: 'protected_activity' }], documents: [{ id: 'doc-3', filename: 'Performance_Review_Q1.pdf', evidence_type: 'ADVERSE_ACTION' }] },
      { id: 'inc-2', title: 'Retaliation: Written Warning Issued', date: '2024-02-15', incident_type: 'retaliation', base_severity: 'severe', computed_severity: 'severe', description: 'Written warning issued', events: [{ event_id: 'anc-3', event_role: 'adverse_action' }], documents: [{ id: 'doc-5', filename: 'Written_Warning.pdf', evidence_type: 'ADVERSE_ACTION' }] },
      { id: 'inc-3', title: 'Retaliation: Termination', date: '2024-03-15', incident_type: 'retaliation', base_severity: 'egregious', computed_severity: 'egregious', description: 'Termination', events: [{ event_id: 'anc-5', event_role: 'adverse_action' }], documents: [{ id: 'doc-7', filename: 'Termination_Letter.pdf', evidence_type: 'ADVERSE_ACTION' }] }
    ]}),
    create: (data) => Promise.resolve({ success: true, incident: { id: 'inc-new', ...data } }),
    update: () => Promise.resolve({ success: true }),
    delete: () => Promise.resolve({ success: true }),
    suggest: () => Promise.resolve({ success: true, suggestions: [] })
  },
  actors: {
    list: () => Promise.resolve({ success: true, actors: _mockActors.map(a => ({ ...a })) }),
    create: (data) => {
      const actor = { id: 'act-' + Date.now(), ...data, appearance_count: 0, in_reporting_chain: 0, aliases: '[]' };
      _mockActors.push(actor);
      return Promise.resolve({ success: true, actor });
    },
    update: (id, updates) => {
      const actor = _mockActors.find(a => a.id === id);
      if (!actor) return Promise.resolve({ success: false, error: 'Actor not found' });
      // Apply field mapping (matches real IPC handler)
      const fieldMap = {
        name: 'name', email: 'email', role: 'role', title: 'title',
        department: 'department', classification: 'classification',
        wouldTheyHelp: 'would_they_help', relationship: 'relationship_to_self',
        reportsTo: 'reports_to', gender: 'gender', disabilityStatus: 'disability_status',
        startDate: 'start_date', endDate: 'end_date'
      };
      for (const [key, dbField] of Object.entries(fieldMap)) {
        if (updates[key] !== undefined) actor[dbField] = updates[key];
      }
      if (updates.aliases !== undefined) {
        actor.aliases = JSON.stringify(Array.isArray(updates.aliases) ? updates.aliases : []);
      }
      if (updates.inReportingChain !== undefined) {
        actor.in_reporting_chain = updates.inReportingChain ? 1 : 0;
      }
      if (updates.secondaryClassifications !== undefined) {
        actor.secondary_classifications = JSON.stringify(updates.secondaryClassifications);
      }
      console.log('[mock] actors.update', id, updates, '->', actor);
      return Promise.resolve({ success: true });
    },
    delete: (id) => {
      const idx = _mockActors.findIndex(a => a.id === id);
      if (idx >= 0) _mockActors.splice(idx, 1);
      return Promise.resolve({ success: true });
    },
    merge: () => Promise.resolve({ success: true }),
    getAppearances: () => Promise.resolve({ success: true, appearances: [] }),
    setSelf: (id) => {
      _mockActors.forEach(a => { a.is_self = a.id === id ? 1 : 0; });
      return Promise.resolve({ success: true });
    },
    checkDuplicates: () => Promise.resolve({ success: true, duplicates: [] }),
    rescan: () => Promise.resolve({ success: true }),
    getForDocument: () => Promise.resolve({ success: true, actors: [] }),
    addToDocument: () => Promise.resolve({ success: true }),
    removeFromDocument: () => Promise.resolve({ success: true }),
    getRelationshipTypes: () => Promise.resolve({ success: true, types: { direct_supervisor: 'Direct Supervisor (your boss)', skip_level: "Skip-Level (boss's boss)", senior_leadership: 'Senior Leadership', hr: 'HR / People Ops', hr_investigator: 'HR Investigator', peer: 'Peer / Colleague', subordinate: 'Subordinate (reports to you)', union_rep: 'Union Representative', legal: 'Legal / Employment Counsel', witness: 'Witness', other: 'Other' } }),
    resolveFromText: () => Promise.resolve({ success: true, role: 'supervisor', inChain: true, actor: null, pending: [] }),
    findInText: () => Promise.resolve({ success: true, matches: [] }),
    getChain: () => Promise.resolve({ success: true, actors: _mockActors.filter(a => !!a.in_reporting_chain).map(a => ({ id: a.id, name: a.name, relationship: a.relationship_to_self })) }),
    getSummary: () => Promise.resolve({ success: true, summary: _mockActors.map(a => '  ' + a.name + ' (' + (a.role || 'no title') + ') -- ' + a.relationship_to_self + (a.in_reporting_chain ? ' [IN REPORTING CHAIN]' : '')).join('\n') })
  },
  precedents: {
    analyze: () => Promise.resolve({ success: true, analysis: {
      caseStrength: 62,
      precedents: {
        burlington: {
          name: 'Burlington Northern v. White',
          alignmentPercent: 78,
          elements: [
            { name: 'Protected Activity', met: true },
            { name: 'Adverse Action', met: true },
            { name: 'Causal Connection', met: true },
            { name: 'Temporal Proximity', met: true }
          ],
          gaps: [
            { element: 'Comparator Evidence', recommendation: 'Document how similarly situated employees were treated differently', severity: 'moderate' }
          ]
        },
        harris: {
          name: 'Harris v. Forklift Systems',
          alignmentPercent: 55,
          elements: [
            { name: 'Unwelcome Conduct', met: true },
            { name: 'Severe or Pervasive', met: false },
            { name: 'Hostile Environment', met: true }
          ],
          gaps: [
            { element: 'Severity Pattern', recommendation: 'Document frequency and severity of each incident to establish pervasiveness', severity: 'high' },
            { element: 'Reasonable Person Standard', recommendation: 'Gather witness statements confirming conduct was objectively offensive', severity: 'moderate' }
          ]
        },
        mcdonnell: {
          name: 'McDonnell Douglas v. Green',
          alignmentPercent: 50,
          elements: [
            { name: 'Protected Class', met: true },
            { name: 'Qualified for Position', met: false },
            { name: 'Adverse Action', met: true },
            { name: 'Pretext', met: false }
          ],
          gaps: [
            { element: 'Qualification Evidence', recommendation: 'Gather positive performance reviews, awards, or commendations prior to complaint', severity: 'high' },
            { element: 'Pretext Evidence', recommendation: 'Document inconsistencies in employer\'s stated reasons for adverse actions', severity: 'high' }
          ]
        }
      }
    }}),
    getDocumentBadges: () => Promise.resolve({ success: true, badges: [] })
  },
  jurisdiction: {
    get: () => Promise.resolve({ success: true, jurisdiction: 'florida' }),
    set: () => Promise.resolve({ success: true })
  },
  payRecords: {
    list: () => Promise.resolve({ success: true, records: [] }),
    create: (data) => Promise.resolve({ success: true, record: { id: 'pay-new', ...data } }),
    update: () => Promise.resolve({ success: true }),
    delete: () => Promise.resolve({ success: true }),
    getForActor: () => Promise.resolve({ success: true, records: [] })
  },
  events: {
    list: () => Promise.resolve({ success: true, events: [
      { id: 'anc-1', event_type: 'employment_start', title: 'Employment Started', date: '2023-06-15', description: 'Started working at Acme Corp as Senior Analyst', tags: ['employment_start'], documents: [], incidents: [], actors: [], precedents: [] },
      { id: 'anc-2', event_type: 'protected_activity', title: 'Reported Discrimination to HR', date: '2024-01-10', description: 'Filed formal complaint with HR about discriminatory treatment by supervisor', tags: ['protected_activity'], documents: [{ id: 'doc-1', filename: 'Discrimination_Complaint.eml', evidence_type: 'PROTECTED_ACTIVITY', group_id: null, is_recap: 1 }], incidents: [], actors: [{ id: 'act-2', name: 'Tom HR', classification: 'enabler', role: 'received complaint' }], precedents: [{ precedent_id: 'faragher', relevance_note: 'Reported to employer' }] },
      { id: 'anc-6', event_type: 'adverse_action', title: 'Excluded from Key Meetings', date: '2024-01-20', description: 'After reporting, was systematically excluded from team meetings and decision-making processes', tags: ['adverse_action', 'exclusion'], documents: [], incidents: [], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'excluded' }], precedents: [{ precedent_id: 'muldrow_some_harm', relevance_note: 'Some harm standard' }] },
      { id: 'anc-7', event_type: 'harassment', title: 'Gendered Language Used', date: null, description: 'Manager referred to employee as "sweetheart" and "honey" in professional settings', tags: ['gender_harassment', 'hostile_environment'], documents: [], incidents: [], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'harasser' }], precedents: [{ precedent_id: 'harris', relevance_note: 'Hostile environment' }] },
      { id: 'anc-3', event_type: 'adverse_action', title: 'Written Warning Issued', date: '2024-02-15', description: 'Received written warning 36 days after filing discrimination complaint', severity: 'severe', tags: ['adverse_action', 'retaliation'], documents: [{ id: 'doc-5', filename: 'Written_Warning.pdf', evidence_type: 'ADVERSE_ACTION', group_id: 'grp-1' }, { id: 'doc-5b', filename: 'Written_Warning_p2.pdf', evidence_type: 'ADVERSE_ACTION', group_id: 'grp-1' }], incidents: [{ id: 'inc-2', title: 'Written warning', computed_severity: 'severe' }], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'issued warning' }], precedents: [{ precedent_id: 'burlington_northern', relevance_note: 'Materially adverse action' }, { precedent_id: 'thomas_proximity', relevance_note: 'Close temporal proximity' }] },
      { id: 'anc-8', event_type: 'adverse_action', title: 'Told to Stop Documenting', date: '2024-02-20', description: 'Manager told employee to stop documenting workplace issues, suggesting retaliation for protected activity', severity: 'severe', tags: ['adverse_action', 'retaliation'], documents: [], incidents: [], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'retaliated' }], precedents: [{ precedent_id: 'monaghan_retaliation', relevance_note: 'Dissuade standard' }] },
      { id: 'anc-4', event_type: 'protected_activity', title: 'EEOC Charge Filed', date: '2024-03-01', description: 'Filed formal EEOC charge of discrimination', tags: ['protected_activity'], documents: [{ id: 'doc-6', filename: 'EEOC_Charge_Filed.pdf', evidence_type: 'PROTECTED_ACTIVITY', group_id: null }], incidents: [], actors: [], precedents: [{ precedent_id: 'joshua_filing', relevance_note: 'Timely FCHR filing' }] },
      { id: 'anc-5', event_type: 'employment_end', title: 'Employment Terminated', date: '2024-03-15', description: 'Terminated 14 days after filing EEOC charge', severity: 'egregious', tags: ['employment_end', 'adverse_action', 'retaliation'], documents: [{ id: 'doc-7', filename: 'Termination_Letter.pdf', evidence_type: 'ADVERSE_ACTION', group_id: null }], incidents: [{ id: 'inc-3', title: 'Termination', computed_severity: 'egregious' }], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'terminated' }, { id: 'act-2', name: 'Tom HR', classification: 'enabler', role: 'processed termination' }], precedents: [{ precedent_id: 'burlington_northern', relevance_note: 'Materially adverse action' }] }
    ]}),
    generate: () => Promise.resolve({ success: true, count: 8, actorsFound: 2, actors: [{ name: 'Jane Manager', classification: 'bad_actor', id: 'act-1' }, { name: 'Tom HR', classification: 'enabler', id: 'act-2' }] }),
    create: (caseId, data) => Promise.resolve({ success: true, event: { id: 'anc-new', ...data } }),
    update: () => Promise.resolve({ success: true }),
    delete: () => Promise.resolve({ success: true }),
    linkEvidence: () => Promise.resolve({ success: true }),
    unlinkEvidence: () => Promise.resolve({ success: true }),
    getRelatedEvidence: (caseId, eventId) => {
      const spokeData = {
        'anc-1': { event: { id: 'anc-1', event_type: 'employment_start', title: 'Employment Started', date: '2023-06-15', what_happened: 'Started working at Acme Corp as Senior Analyst. Reported to Jane Manager in the Analytics department.', where_location: 'Acme Corp HQ', impact_summary: null, severity: null, tags: ['employment_start'] }, linked: { documents: [], incidents: [], actors: [], precedents: [] }, causalityLinks: [], nearby: { documents: [{ id: 'doc-1', filename: 'Offer_Letter.pdf' }] } },
        'anc-2': { event: { id: 'anc-2', event_type: 'protected_activity', title: 'Reported Discrimination to HR', date: '2024-01-10', what_happened: 'Filed formal complaint with HR about discriminatory treatment by supervisor. Described repeated age-related comments and exclusion from projects.', where_location: 'HR Office, Building A', impact_summary: 'Created official record of complaint. Triggered employer duty to investigate.', severity: 'moderate', tags: ['protected_activity'] }, linked: { documents: [{ id: 'doc-1', filename: 'Discrimination_Complaint.eml', evidence_type: 'PROTECTED_ACTIVITY', relevance: 'source', group_id: null, document_date: '2024-01-10', is_recap: 1 }], incidents: [], actors: [{ id: 'act-2', name: 'Tom HR', classification: 'enabler', role: 'received complaint' }], precedents: [{ precedent_id: 'faragher', relevance_note: 'Reported to employer' }] }, causalityLinks: [{ id: 'link-1', target_event_id: 'anc-6', link_type: 'caused', confidence: 0.95, days_between: 10 }, { id: 'link-2', target_event_id: 'anc-3', link_type: 'caused', confidence: 0.85, days_between: 36 }], nearby: { documents: [{ id: 'doc-4', filename: 'Coworker_Witness_Statement.pdf' }] } },
        'anc-6': { event: { id: 'anc-6', event_type: 'adverse_action', title: 'Excluded from Key Meetings', date: '2024-01-20', what_happened: 'After reporting, was systematically excluded from team meetings and decision-making processes. Lost access to shared project folders.', where_location: 'Office, various conference rooms', impact_summary: 'Marginalized from team. Lost visibility into key projects.', severity: 'moderate', tags: ['adverse_action', 'exclusion'] }, linked: { documents: [], incidents: [], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'excluded from meetings' }], precedents: [{ precedent_id: 'muldrow_some_harm', relevance_note: 'Some harm standard' }] }, causalityLinks: [], nearby: { documents: [] } },
        'anc-7': { event: { id: 'anc-7', event_type: 'harassment', title: 'Gendered Language Used', date: null, what_happened: 'Manager referred to employee as "sweetheart" and "honey" in professional settings, creating hostile work environment.', where_location: 'Office, team meetings', impact_summary: 'Contributed to hostile work environment. Undermined professional standing.', severity: 'moderate', tags: ['gender_harassment', 'hostile_environment'] }, linked: { documents: [], incidents: [], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'harasser' }], precedents: [{ precedent_id: 'harris', relevance_note: 'Hostile environment' }] }, causalityLinks: [], nearby: { documents: [] } },
        'anc-3': { event: { id: 'anc-3', event_type: 'adverse_action', title: 'Written Warning Issued', date: '2024-02-15', what_happened: 'Received written warning 36 days after filing discrimination complaint. No prior performance issues documented.', where_location: 'HR Office, Building A', impact_summary: 'Created paper trail for eventual termination. Damaged professional reputation.', severity: 'severe', tags: ['adverse_action', 'retaliation'] }, linked: { documents: [{ id: 'doc-5', filename: 'Written_Warning.pdf', evidence_type: 'ADVERSE_ACTION', relevance: 'source', group_id: 'grp-1', document_date: '2024-02-15' }, { id: 'doc-5b', filename: 'Written_Warning_p2.pdf', evidence_type: 'ADVERSE_ACTION', relevance: 'source', group_id: 'grp-1', document_date: '2024-02-15' }], incidents: [{ id: 'inc-2', title: 'Written warning issued', computed_severity: 'severe' }], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'issued warning' }, { id: 'act-2', name: 'Tom HR', classification: 'enabler', role: 'present in meeting' }], precedents: [{ precedent_id: 'burlington_northern', relevance_note: 'Materially adverse action' }, { precedent_id: 'thomas_proximity', relevance_note: 'Close temporal proximity' }] }, causalityLinks: [], nearby: { documents: [{ id: 'doc-4', filename: 'Coworker_Witness_Statement.pdf' }] } },
        'anc-8': { event: { id: 'anc-8', event_type: 'adverse_action', title: 'Told to Stop Documenting', date: '2024-02-20', what_happened: 'Manager told employee to stop documenting workplace issues, suggesting retaliation for protected activity.', where_location: 'Manager office', impact_summary: 'Attempted to suppress evidence gathering. Shows consciousness of guilt.', severity: 'severe', tags: ['adverse_action', 'retaliation'] }, linked: { documents: [], incidents: [], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'retaliated' }], precedents: [{ precedent_id: 'monaghan_retaliation', relevance_note: 'Dissuade standard' }] }, causalityLinks: [], nearby: { documents: [{ id: 'doc-5', filename: 'Written_Warning.pdf' }] } },
        'anc-4': { event: { id: 'anc-4', event_type: 'protected_activity', title: 'EEOC Charge Filed', date: '2024-03-01', what_happened: 'Filed formal EEOC charge of discrimination citing age and gender discrimination, plus retaliation.', where_location: 'EEOC Regional Office', impact_summary: 'Engaged federal enforcement. Started 180-day investigation clock.', severity: null, tags: ['protected_activity'] }, linked: { documents: [{ id: 'doc-6', filename: 'EEOC_Charge_Filed.pdf', evidence_type: 'PROTECTED_ACTIVITY', relevance: 'source', group_id: null, document_date: '2024-03-01' }], incidents: [], actors: [], precedents: [{ precedent_id: 'joshua_filing', relevance_note: 'Timely FCHR filing' }] }, causalityLinks: [{ id: 'link-3', target_event_id: 'anc-5', link_type: 'caused', confidence: 0.95, days_between: 14 }], nearby: { documents: [] } },
        'anc-5': { event: { id: 'anc-5', event_type: 'employment_end', title: 'Employment Terminated', date: '2024-03-15', what_happened: 'Terminated 14 days after filing EEOC charge. Employer cited "restructuring" but no other positions were eliminated.', where_location: 'HR Office, Building A', impact_summary: 'Lost income and benefits. Strong temporal proximity to EEOC filing supports retaliation claim.', severity: 'egregious', tags: ['employment_end', 'adverse_action', 'retaliation'] }, linked: { documents: [{ id: 'doc-7', filename: 'Termination_Letter.pdf', evidence_type: 'ADVERSE_ACTION', relevance: 'source', group_id: null, document_date: '2024-03-15' }], incidents: [{ id: 'inc-3', title: 'Termination', computed_severity: 'egregious' }], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'terminated' }, { id: 'act-2', name: 'Tom HR', classification: 'enabler', role: 'processed termination' }], precedents: [{ precedent_id: 'burlington_northern', relevance_note: 'Materially adverse action' }] }, causalityLinks: [], nearby: { documents: [{ id: 'doc-6', filename: 'EEOC_Charge_Filed.pdf' }] } }
      };
      const data = spokeData[eventId] || spokeData['anc-3'];
      return Promise.resolve({ success: true, ...data });
    },
    clone: () => Promise.resolve({ success: true, newId: 'anc-cloned' }),
    reorder: () => Promise.resolve({ success: true }),
    linkPrecedent: () => Promise.resolve({ success: true }),
    unlinkPrecedent: () => Promise.resolve({ success: true }),
    getPrecedents: () => Promise.resolve({ success: true, precedents: [] }),
    breakApart: () => Promise.resolve({ success: true, newEvents: [{ id: 'anc-split-1', title: 'Part 1' }, { id: 'anc-split-2', title: 'Part 2' }] }),
    linkIncident: () => Promise.resolve({ success: true }),
    unlinkIncident: () => Promise.resolve({ success: true }),
    linkActor: () => Promise.resolve({ success: true }),
    unlinkActor: () => Promise.resolve({ success: true }),
    linkDocumentV2: () => Promise.resolve({ success: true })
  },
  eventTags: {
    set: (eventId, tags) => Promise.resolve({ success: true }),
    listAll: () => Promise.resolve({ success: true, tags: ['sexual_harassment', 'gender_harassment', 'protected_activity', 'adverse_action', 'retaliation', 'exclusion', 'pay_discrimination', 'hostile_environment', 'help_request', 'employment_start', 'employment_end'] }),
    suggest: () => Promise.resolve({ success: true, tags: ['adverse_action', 'retaliation'] })
  },
  eventLinks: {
    list: () => Promise.resolve({ success: true, links: [
      { id: 'link-1', source_event_id: 'anc-2', target_event_id: 'anc-6', link_type: 'caused', confidence: 0.95, days_between: 10, source_title: 'Reported Discrimination to HR', source_date: '2024-01-10', target_title: 'Excluded from Key Meetings', target_date: '2024-01-20' },
      { id: 'link-2', source_event_id: 'anc-2', target_event_id: 'anc-3', link_type: 'caused', confidence: 0.85, days_between: 36, source_title: 'Reported Discrimination to HR', source_date: '2024-01-10', target_title: 'Written Warning Issued', target_date: '2024-02-15' },
      { id: 'link-3', source_event_id: 'anc-4', target_event_id: 'anc-5', link_type: 'caused', confidence: 0.95, days_between: 14, source_title: 'EEOC Charge Filed', source_date: '2024-03-01', target_title: 'Employment Terminated', target_date: '2024-03-15' }
    ] }),
    create: (data) => Promise.resolve({ success: true, link: { id: 'link-new', ...data } }),
    delete: () => Promise.resolve({ success: true }),
    suggest: () => Promise.resolve({ success: true, suggestions: [] })
  },
  incidentEvents: {
    list: (incidentId) => {
      const evtMap = {
        'inc-1': [{ id: 'anc-2', event_id: 'anc-2', title: 'Reported Discrimination to HR', date: '2024-01-10', event_role: 'protected_activity' }],
        'inc-2': [{ id: 'anc-3', event_id: 'anc-3', title: 'Written Warning Issued', date: '2024-02-15', event_role: 'adverse_action' }],
        'inc-3': [{ id: 'anc-5', event_id: 'anc-5', title: 'Employment Terminated', date: '2024-03-15', event_role: 'adverse_action' }]
      };
      return Promise.resolve({ success: true, events: evtMap[incidentId] || [] });
    },
    link: (incidentId, eventId, eventRole) => Promise.resolve({ success: true }),
    unlink: (incidentId, eventId) => Promise.resolve({ success: true })
  },
  damages: {
    list: () => Promise.resolve({ success: true, damages: [] }),
    create: (caseId, data) => Promise.resolve({ success: true, damage: { id: 'dmg-new', ...data } }),
    update: () => Promise.resolve({ success: true }),
    delete: () => Promise.resolve({ success: true })
  },
  context: {
    get: () => Promise.resolve({ success: true, context: { id: 1, narrative: 'I started working at Acme Corp in June 2023 as a Senior Analyst. In January 2024, I reported discrimination to HR after my supervisor made repeated comments about my age. After I filed the complaint, my manager put me on a performance improvement plan and gave me a written warning. I then filed an EEOC charge in March 2024. Two weeks later, I was terminated.', hire_date: '2023-06-15', end_date: '2024-03-15', case_type: 'retaliation' } }),
    update: () => Promise.resolve({ success: true })
  },
  groups: {
    create: () => Promise.resolve({ success: true, group: { id: 'grp-new' } }),
    list: () => Promise.resolve({ success: true, groups: [] }),
    delete: () => Promise.resolve({ success: true }),
    getMembers: () => Promise.resolve({ success: true, members: [] })
  },
  categorizer: {
    categorize: () => Promise.resolve({ success: true, result: { category: 'INCIDENT', severity: 'high', confidence: 0.85 } }),
    buildChain: () => Promise.resolve({ success: true, summary: {} }),
    analyzeDocuments: () => Promise.resolve({ success: true, summary: {
      incidentType: 'retaliation',
      incidentSeverity: 'high',
      incidentDate: 'January 10, 2024',
      reports: [
        { category: 'REPORT_HR', reportedTo: 'HR', date: 'January 10, 2024', noticeSequence: 1, flags: [] },
        { category: 'REPORT_SUPERVISOR', reportedTo: 'supervisor', date: 'January 12, 2024', noticeSequence: 1, flags: ['verbal_report_only'] },
        { category: 'REPORT_HR', reportedTo: 'HR', date: 'February 20, 2024', noticeSequence: 2, flags: ['no_action_taken', 'conduct_continued_after_report'] }
      ],
      followupEmails: 1,
      meetings: 1,
      witnesses: 0,
      responsesReceived: 0,
      retaliationEntries: 1,
      documentationStrength: 'moderate',
      employerLiability: {
        level: 'high',
        signals: ['notice_without_remedy', 'repeated_notice_no_action', 'conduct_continued_after_notice', 'potential_retaliation_post_report', 'hostile_work_environment_ongoing'],
        conductContinuedPostReport: true,
        noticeByRecipient: {
          HR: { timesNotified: 2, actionTaken: false, actionStatus: 'no', allVerbalOnly: false, recipientImportance: { level: 'critical', label: 'HR / Compliance', note: 'Employer is fully on legal notice \u2014 duty to investigate attaches immediately' }, liabilitySignals: ['notice_without_remedy', 'repeated_notice_no_action', 'multiple_reports_to_same_recipient'] },
          supervisor: { timesNotified: 1, actionTaken: false, actionStatus: 'unknown', allVerbalOnly: true, recipientImportance: { level: 'moderate', label: 'Direct Supervisor', note: 'Employer on notice if supervisor has authority to act or report up' }, liabilitySignals: ['notice_without_remedy', 'no_written_acknowledgement_of_notice'] }
        }
      }
    }})
  },
  settings: {
    get: (key) => Promise.resolve({ success: true, value: key === 'anthropic_api_key' ? 'sk-mock-key' : null }),
    set: (key, value) => Promise.resolve({ success: true })
  },
  contextDocs: {
    list: () => Promise.resolve({ success: true, documents: [
      { doc_id: 'ctx-1', filename: 'Employee_Handbook_2023.pdf', doc_type: 'handbook', display_name: 'Acme Corp Employee Handbook 2023', date_uploaded: '2024-01-05T10:00:00Z', date_effective: '2023-01-01', is_active: true, notes: '', signals: { pip_requires_prior_warning: true, pip_requires_documentation: true, pip_employee_has_right_to_respond: true, has_anti_harassment_policy: true, harassment_reporting_procedure: true, non_retaliation_clause: true, at_will_employment: true, for_cause_termination_required: false, arbitration_required: false, class_action_waiver: false, fmla_rights_documented: true, pip_requires_specific_metrics: false }, signalSummary: ['pip_requires_prior_warning', 'pip_requires_documentation', 'pip_employee_has_right_to_respond', 'has_anti_harassment_policy', 'harassment_reporting_procedure', 'non_retaliation_clause', 'at_will_employment', 'fmla_rights_documented'] },
      { doc_id: 'ctx-2', filename: 'Arbitration_Agreement.pdf', doc_type: 'arbitration_agreement', display_name: 'Arbitration Agreement', date_uploaded: '2024-01-06T14:30:00Z', date_effective: '2023-06-15', is_active: true, notes: 'Signed at hire', signals: { arbitration_required: true, class_action_waiver: true, at_will_employment: false, pip_requires_prior_warning: false, pip_requires_documentation: false, pip_employee_has_right_to_respond: false, has_anti_harassment_policy: false, harassment_reporting_procedure: false, non_retaliation_clause: false, for_cause_termination_required: false, fmla_rights_documented: false, pip_requires_specific_metrics: false }, signalSummary: ['arbitration_required', 'class_action_waiver'] }
    ]}),
    ingest: (data) => Promise.resolve({ success: true, docId: 'ctx-new', displayName: data.displayName || 'New Document', signals: { at_will_employment: true }, signalSummary: ['at_will_employment'] }),
    ingestFile: () => Promise.resolve({ success: true, docId: 'ctx-file', displayName: 'Uploaded File', signals: {}, signalSummary: [] }),
    delete: () => Promise.resolve({ success: true }),
    toggleActive: () => Promise.resolve({ success: true }),
    get: (docId) => Promise.resolve({ success: true, document: { doc_id: docId, filename: 'Employee_Handbook_2023.pdf', doc_type: 'handbook', display_name: 'Acme Corp Employee Handbook 2023', full_text: 'EMPLOYEE HANDBOOK\n\nSection 1: Employment At-Will\nEmployment with Acme Corp is at-will. Either party may terminate the employment relationship at any time.\n\nSection 5: Progressive Discipline\nAcme Corp uses a progressive discipline process. Prior to any Performance Improvement Plan (PIP), the employee must receive a verbal warning followed by a written warning.\n\nSection 7: Anti-Harassment Policy\nAcme Corp prohibits harassment and discrimination based on race, color, religion, sex, national origin, age, disability, or any other protected class.\n\nSection 8: Reporting Procedures\nEmployees should report harassment or discrimination to their supervisor, HR, or the anonymous hotline.\n\nSection 9: Non-Retaliation\nRetaliation against any employee who reports harassment or discrimination is strictly prohibited and against policy.\n\nSection 12: FMLA\nEligible employees have the right to take up to 12 weeks of unpaid leave under FMLA.', date_uploaded: '2024-01-05T10:00:00Z', date_effective: '2023-01-01', is_active: true, notes: '', signals: { pip_requires_prior_warning: true, pip_requires_documentation: true, pip_employee_has_right_to_respond: true, has_anti_harassment_policy: true, harassment_reporting_procedure: true, non_retaliation_clause: true, at_will_employment: true, fmla_rights_documented: true }, signalSummary: ['pip_requires_prior_warning', 'pip_requires_documentation', 'pip_employee_has_right_to_respond', 'has_anti_harassment_policy', 'harassment_reporting_procedure', 'non_retaliation_clause', 'at_will_employment', 'fmla_rights_documented'] } }),
    search: (query) => Promise.resolve({ success: true, results: [{ doc: { doc_id: 'ctx-1', display_name: 'Employee Handbook' }, excerpts: ['...progressive discipline process. Prior to any PIP...'] }] }),
    signalsSummary: () => Promise.resolve({ success: true, summary: { pip_requires_prior_warning: 'Employee Handbook', non_retaliation_clause: 'Employee Handbook', arbitration_required: 'Arbitration Agreement' } }),
    types: () => Promise.resolve({ success: true, types: { employment_agreement: 'Employment Agreement / Offer Letter', handbook: 'Employee Handbook', harassment_policy: 'Harassment / Anti-Discrimination Policy', pip_policy: 'PIP / Performance Improvement Policy', progressive_discipline: 'Progressive Discipline Policy', fmla_policy: 'FMLA / Leave Policy', retaliation_policy: 'Non-Retaliation Policy', arbitration_agreement: 'Arbitration / Dispute Resolution Agreement', nda: 'NDA / Confidentiality Agreement', job_description: 'Job Description / Role Definition', severance_agreement: 'Severance Agreement', company_email: 'Company Email / HR Communication', other_policy: 'Other Policy Document', other: 'Other' } })
  },
  assessor: {
    assess: (data) => Promise.resolve({ success: true, result: {
      inputType: data.inputType || 'pip_document',
      riskLevel: 'HIGH',
      flags: [
        { id: 'vague_performance_claims', severity: 'high', title: 'Vague Performance Claims', detail: 'Document uses subjective language ("attitude", "not a team player") without specific, measurable performance deficiencies.', category: 'pattern' },
        { id: 'timing_suspicious', severity: 'high', title: 'Suspicious Timing', detail: 'Document was issued 36 days after a protected activity (discrimination complaint filed 2024-01-10). This falls within the window courts consider probative of retaliatory intent.', category: 'timing' },
        { id: 'contradicts_prior_positive', severity: 'moderate', title: 'Contradicts Prior Positive Feedback', detail: 'Employee had previously received positive performance reviews. The sudden shift to negative assessment without intervening events is suspicious.', category: 'pattern' },
        { id: 'policy_violation_no_prior_warning', severity: 'high', title: 'Policy Violation: No Prior Warning', detail: 'Company handbook requires verbal warning before written warning. No verbal warning was documented prior to this PIP.', category: 'policy' },
        { id: 'no_specific_examples', severity: 'moderate', title: 'No Specific Examples', detail: 'Document uses general terms ("frequently fails to meet deadlines") without citing specific dates, projects, or measurable shortfalls.', category: 'pattern' }
      ],
      claimsVsEvidence: [
        { claim: 'Employee frequently misses deadlines', verdict: 'UNSUPPORTED', reasoning: 'No specific deadlines or projects cited. Prior Q1 performance review rated employee as "meets expectations" on timeliness.' },
        { claim: 'Employee has attitude problems with team', verdict: 'SUSPICIOUS', reasoning: 'Subjective characterization. No specific incidents documented. Vault contains witness statement from coworker describing professional behavior.' },
        { claim: 'Employee needs to improve communication', verdict: 'VAGUE', reasoning: 'No measurable communication metrics defined. No prior documented concerns about communication.' }
      ],
      summary: 'This PIP document presents significant legal risk for the employer. Multiple red flags suggest it may be retaliatory rather than a genuine performance management tool.',
      legalExposure: 'Strong indicators of retaliation under Burlington Northern v. White. Temporal proximity (36 days) between protected activity and adverse action supports inference of retaliatory motive. Employer\'s own handbook policies appear violated.'
    }}),
    expandFlag: (data) => Promise.resolve({ success: true, result: {
      flagId: data.flagId,
      deepDive: 'Detailed analysis of this flag with supporting evidence and legal context...',
      relevantLaw: 'Under Burlington Northern v. White (2006), any action that would deter a reasonable employee from engaging in protected activity constitutes actionable retaliation.',
      recommendations: ['Document the absence of prior verbal warning', 'Compare timeline against handbook policy requirements', 'Gather comparator evidence showing other employees were not subjected to similar PIPs']
    }}),
    deepAnalysis: (data) => Promise.resolve({ success: true, result: {
      memo: '# LEGAL ASSESSMENT MEMORANDUM\n\n## Document Type: PIP / Performance Improvement Plan\n## Risk Level: HIGH\n\n### Executive Summary\nThis PIP document exhibits multiple characteristics consistent with retaliatory adverse employment action rather than legitimate performance management.\n\n### Key Findings\n1. **Temporal Proximity**: Issued 36 days after protected activity\n2. **Policy Non-Compliance**: Violates employer\'s own progressive discipline policy\n3. **Vague Standards**: Fails to provide measurable, objective performance criteria\n4. **Contradictory Record**: Conflicts with prior positive performance evaluations\n\n### Legal Framework\nUnder the McDonnell Douglas burden-shifting framework, employee can establish prima facie case of retaliation. Employer must then articulate legitimate non-retaliatory reason. The deficiencies in this PIP undermine any such justification.\n\n### Recommendations\n- Preserve all communications surrounding the PIP issuance\n- Document the absence of prior corrective steps required by handbook\n- Identify comparator employees to establish selective enforcement'
    }}),
    inputTypes: () => Promise.resolve({ success: true, types: {
      pip_document: 'PIP / Performance Improvement Plan',
      written_warning: 'Written Warning / Disciplinary Notice',
      termination_letter: 'Termination Letter / Separation Notice',
      performance_review: 'Performance Review / Evaluation',
      hr_email: 'HR Email / Communication',
      employer_response: 'Employer Response to Complaint',
      other: 'Other Employer Document'
    }})
  },
  dialog: {
    openFiles: () => Promise.resolve({ canceled: true, filePaths: [] })
  },

  // Electron webUtils mock for drag-and-drop file paths
  getPathForFile: (file) => file.name || 'unknown-file'
};
