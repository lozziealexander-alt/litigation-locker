#!/usr/bin/env node
/**
 * Generate a test vault.enc.json from mock data for previewing the web viewer.
 * Usage: node scripts/generate-test-vault.js [password]
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const password = process.argv[2] || 'test1234';

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

// Mock case data (matches the shapes from mock-api.js)
const mockData = {
  caseId: 'case-1',
  caseName: 'Employment Dispute 2024',
  documents: [
    { id: 'doc-1', filename: 'Discrimination_Complaint.eml', evidence_type: 'PROTECTED_ACTIVITY', document_date: '2024-01-10', document_date_confidence: 'exact', file_type: 'message/rfc822', file_size: 15360, is_recap: 1, document_subtype: 'recap_self_doc', extracted_text: 'From: employee@company.com\nTo: hr@company.com\nSubject: Formal Complaint - Discriminatory Treatment\n\nDear HR,\n\nI am writing to formally report discriminatory treatment by my supervisor, Jane Manager. Over the past several months, I have experienced repeated age-related comments and been systematically excluded from key projects.' },
    { id: 'doc-3', filename: 'Performance_Review_Q1.pdf', evidence_type: 'ADVERSE_ACTION', document_date: '2024-01-24', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 102400, extracted_text: 'Q1 Performance Review\n\nEmployee demonstrates below expectations in several areas. Communication needs improvement. Not meeting team collaboration standards.' },
    { id: 'doc-5', filename: 'Written_Warning.pdf', evidence_type: 'ADVERSE_ACTION', document_date: '2024-02-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 245760, group_id: 'grp-1', extracted_text: 'WRITTEN WARNING\n\nEmployee: [Name Redacted]\nDate: February 15, 2024\nSupervisor: Jane Manager\n\nThis letter serves as a formal written warning regarding your performance. After multiple discussions about expectations and goals, we have not seen sufficient improvement.' },
    { id: 'doc-6', filename: 'EEOC_Charge_Filed.pdf', evidence_type: 'PROTECTED_ACTIVITY', document_date: '2024-03-01', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 327680, extracted_text: 'EEOC CHARGE OF DISCRIMINATION\n\nCharge No: 510-2024-XXXXX\nFiling Date: March 1, 2024\n\nI believe I have been discriminated against based on my age and gender, and retaliated against for filing an internal complaint.' },
    { id: 'doc-7', filename: 'Termination_Letter.pdf', evidence_type: 'ADVERSE_ACTION', document_date: '2024-03-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 184320, extracted_text: 'NOTICE OF TERMINATION\n\nEffective Date: March 15, 2024\n\nDear [Employee],\n\nThis letter is to inform you that your employment with Acme Corp is being terminated effective immediately due to organizational restructuring.' },
    { id: 'doc-8', filename: 'Pay_Stub_March.pdf', evidence_type: 'PAY_RECORD', document_date: '2024-03-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 40960, extracted_text: 'Pay stub for period ending March 15, 2024.' }
  ],
  actors: [
    { id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', secondary_classifications: '["enabler"]', role: 'Direct Supervisor', relationship_to_self: 'supervisor', in_reporting_chain: 1, aliases: '["Jane M", "J. Manager"]' },
    { id: 'act-2', name: 'Tom HR', classification: 'enabler', secondary_classifications: null, role: 'HR Director', relationship_to_self: 'hr', in_reporting_chain: 0, aliases: '[]' },
    { id: 'act-3', name: 'Sarah Coworker', classification: 'witness_supportive', secondary_classifications: '["corroborator"]', role: 'Colleague', relationship_to_self: 'peer', in_reporting_chain: 0, aliases: '["Sarah C"]' },
    { id: 'act-4', name: 'Mike VP', classification: 'bad_actor', secondary_classifications: null, role: 'VP Operations', relationship_to_self: 'senior_leadership', in_reporting_chain: 1, aliases: '["Mike", "Michael VP"]' },
    { id: 'act-self', name: 'You (Self)', classification: 'self', secondary_classifications: null, role: 'Senior Analyst', relationship_to_self: 'self', is_self: 1, gender: 'female', disability_status: 'no', in_reporting_chain: 0, aliases: '[]' }
  ],
  actorAppearances: [
    { actor_id: 'act-1', document_id: 'doc-1', role_in_document: 'mentioned', confidence: 1.0 },
    { actor_id: 'act-2', document_id: 'doc-1', role_in_document: 'recipient', confidence: 1.0 },
    { actor_id: 'act-1', document_id: 'doc-5', role_in_document: 'author', confidence: 1.0 },
    { actor_id: 'act-1', document_id: 'doc-7', role_in_document: 'mentioned', confidence: 1.0 },
    { actor_id: 'act-2', document_id: 'doc-7', role_in_document: 'mentioned', confidence: 1.0 }
  ],
  events: [
    { id: 'anc-1', event_type: 'employment_start', title: 'Employment Started', date: '2023-06-15', description: 'Started working at Acme Corp as Senior Analyst', what_happened: 'Started working at Acme Corp as Senior Analyst. Reported to Jane Manager in the Analytics department.' },
    { id: 'anc-2', event_type: 'protected_activity', title: 'Reported Discrimination to HR', date: '2024-01-10', description: 'Filed formal complaint with HR about discriminatory treatment by supervisor', what_happened: 'Filed formal complaint with HR about discriminatory treatment by supervisor. Described repeated age-related comments and exclusion from projects.', where_location: 'HR Office, Building A', impact_summary: 'Created official record of complaint. Triggered employer duty to investigate.', severity: 'moderate' },
    { id: 'anc-6', event_type: 'adverse_action', title: 'Excluded from Key Meetings', date: '2024-01-20', description: 'After reporting, was systematically excluded from team meetings and decision-making processes', what_happened: 'After reporting, was systematically excluded from team meetings and decision-making processes. Lost access to shared project folders.', severity: 'moderate' },
    { id: 'anc-7', event_type: 'harassment', title: 'Gendered Language Used', date: null, description: 'Manager referred to employee as "sweetheart" and "honey" in professional settings', what_happened: 'Manager referred to employee as "sweetheart" and "honey" in professional settings, creating hostile work environment.', severity: 'moderate' },
    { id: 'anc-3', event_type: 'adverse_action', title: 'Written Warning Issued', date: '2024-02-15', description: 'Received written warning 36 days after filing discrimination complaint', what_happened: 'Received written warning 36 days after filing discrimination complaint. No prior performance issues documented.', severity: 'severe' },
    { id: 'anc-8', event_type: 'adverse_action', title: 'Told to Stop Documenting', date: '2024-02-20', description: 'Manager told employee to stop documenting workplace issues', what_happened: 'Manager told employee to stop documenting workplace issues, suggesting retaliation for protected activity.', severity: 'severe' },
    { id: 'anc-4', event_type: 'protected_activity', title: 'EEOC Charge Filed', date: '2024-03-01', description: 'Filed formal EEOC charge of discrimination', what_happened: 'Filed formal EEOC charge of discrimination citing age and gender discrimination, plus retaliation.' },
    { id: 'anc-5', event_type: 'employment_end', title: 'Employment Terminated', date: '2024-03-15', description: 'Terminated 14 days after filing EEOC charge', what_happened: 'Terminated 14 days after filing EEOC charge. Employer cited "restructuring" but no other positions were eliminated.', severity: 'egregious' }
  ],
  eventTags: [
    { event_id: 'anc-1', tag: 'employment_start' },
    { event_id: 'anc-2', tag: 'protected_activity' },
    { event_id: 'anc-6', tag: 'adverse_action' }, { event_id: 'anc-6', tag: 'exclusion' },
    { event_id: 'anc-7', tag: 'gender_harassment' }, { event_id: 'anc-7', tag: 'hostile_environment' },
    { event_id: 'anc-3', tag: 'adverse_action' }, { event_id: 'anc-3', tag: 'retaliation' },
    { event_id: 'anc-8', tag: 'adverse_action' }, { event_id: 'anc-8', tag: 'retaliation' },
    { event_id: 'anc-4', tag: 'protected_activity' },
    { event_id: 'anc-5', tag: 'employment_end' }, { event_id: 'anc-5', tag: 'adverse_action' }, { event_id: 'anc-5', tag: 'retaliation' }
  ],
  eventDocuments: [
    { event_id: 'anc-2', document_id: 'doc-1', relevance: 'source' },
    { event_id: 'anc-3', document_id: 'doc-5', relevance: 'source' },
    { event_id: 'anc-4', document_id: 'doc-6', relevance: 'source' },
    { event_id: 'anc-5', document_id: 'doc-7', relevance: 'source' }
  ],
  eventActors: [
    { event_id: 'anc-2', actor_id: 'act-2', role: 'received complaint' },
    { event_id: 'anc-6', actor_id: 'act-1', role: 'excluded from meetings' },
    { event_id: 'anc-7', actor_id: 'act-1', role: 'harasser' },
    { event_id: 'anc-3', actor_id: 'act-1', role: 'issued warning' },
    { event_id: 'anc-8', actor_id: 'act-1', role: 'retaliated' },
    { event_id: 'anc-5', actor_id: 'act-1', role: 'terminated' },
    { event_id: 'anc-5', actor_id: 'act-2', role: 'processed termination' }
  ],
  eventPrecedents: [
    { event_id: 'anc-2', precedent_id: 'faragher', relevance_note: 'Reported to employer' },
    { event_id: 'anc-3', precedent_id: 'burlington_northern', relevance_note: 'Materially adverse action' },
    { event_id: 'anc-3', precedent_id: 'thomas_proximity', relevance_note: 'Close temporal proximity' },
    { event_id: 'anc-5', precedent_id: 'burlington_northern', relevance_note: 'Materially adverse action' }
  ],
  eventLinks: [
    { id: 'link-1', source_event_id: 'anc-2', target_event_id: 'anc-6', link_type: 'caused', confidence: 0.95, days_between: 10 },
    { id: 'link-2', source_event_id: 'anc-2', target_event_id: 'anc-3', link_type: 'caused', confidence: 0.85, days_between: 36 },
    { id: 'link-3', source_event_id: 'anc-4', target_event_id: 'anc-5', link_type: 'caused', confidence: 0.95, days_between: 14 }
  ],
  incidents: [
    { id: 'inc-1', title: 'Retaliation: Performance Review After Complaint', date: '2024-01-24', incident_type: 'retaliation', base_severity: 'severe', computed_severity: 'severe', description: 'Negative performance review after complaint' },
    { id: 'inc-2', title: 'Retaliation: Written Warning Issued', date: '2024-02-15', incident_type: 'retaliation', base_severity: 'severe', computed_severity: 'severe', description: 'Written warning issued' },
    { id: 'inc-3', title: 'Retaliation: Termination', date: '2024-03-15', incident_type: 'retaliation', base_severity: 'egregious', computed_severity: 'egregious', description: 'Termination' }
  ],
  incidentDocuments: [
    { incident_id: 'inc-1', document_id: 'doc-3' },
    { incident_id: 'inc-2', document_id: 'doc-5' },
    { incident_id: 'inc-3', document_id: 'doc-7' }
  ],
  incidentEvents: [
    { incident_id: 'inc-1', event_id: 'anc-2', event_role: 'protected_activity' },
    { incident_id: 'inc-2', event_id: 'anc-3', event_role: 'adverse_action' },
    { incident_id: 'inc-3', event_id: 'anc-5', event_role: 'adverse_action' }
  ],
  timelineConnections: [
    { source_id: 'doc-1', source_type: 'document', target_id: 'doc-3', target_type: 'document', connection_type: 'retaliation_chain', strength: 0.85, days_between: 14, description: '14 days after protected activity' },
    { source_id: 'doc-1', source_type: 'document', target_id: 'doc-5', target_type: 'document', connection_type: 'retaliation_chain', strength: 0.7, days_between: 36, description: '36 days after protected activity' },
    { source_id: 'doc-6', source_type: 'document', target_id: 'doc-7', target_type: 'document', connection_type: 'retaliation_chain', strength: 0.9, days_between: 14, description: '14 days after protected activity' }
  ],
  context: { narrative: 'I started working at Acme Corp in June 2023 as a Senior Analyst. In January 2024, I reported discrimination to HR after my supervisor made repeated comments about my age. After I filed the complaint, my manager put me on a performance improvement plan and gave me a written warning. I then filed an EEOC charge in March 2024. Two weeks later, I was terminated.', hire_date: '2023-06-15', end_date: '2024-03-15', case_type: 'retaliation', jurisdiction: 'both' },
  precedents: [],
  payRecords: [],
  damages: [],
  groups: [{ id: 'grp-1', name: 'Written Warning Package', description: 'Multi-page warning document', color: '#EF4444' }],
  notifications: [],
  brief: null,
  contextDocs: []
};

// Encrypt
const salt = crypto.randomBytes(SALT_LENGTH);
const iv = crypto.randomBytes(IV_LENGTH);
const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const json = JSON.stringify(mockData);
const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
const authTag = cipher.getAuthTag();

const bundle = {
  encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  caseName: mockData.caseName
};

const outPath = path.join(__dirname, '..', 'docs', 'vault.enc.json');
fs.writeFileSync(outPath, JSON.stringify(bundle));
console.log(`Test vault written to ${outPath}`);
console.log(`Password: ${password}`);
