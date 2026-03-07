// Mock Electron preload API for browser preview
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
      { id: 'doc-1', filename: 'Discrimination_Complaint.eml', evidence_type: 'PROTECTED_ACTIVITY', document_date: '2024-01-10', document_date_confidence: 'exact', file_type: 'message/rfc822', file_size: 15360 },
      { id: 'doc-3', filename: 'Performance_Review_Q1.pdf', evidence_type: 'ADVERSE_ACTION', document_date: '2024-01-24', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 102400 },
      { id: 'doc-5', filename: 'Written_Warning.pdf', evidence_type: 'ADVERSE_ACTION', document_date: '2024-02-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 245760 },
      { id: 'doc-6', filename: 'EEOC_Charge_Filed.pdf', evidence_type: 'PROTECTED_ACTIVITY', document_date: '2024-03-01', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 327680 },
      { id: 'doc-7', filename: 'Termination_Letter.pdf', evidence_type: 'ADVERSE_ACTION', document_date: '2024-03-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 184320 },
      { id: 'doc-8', filename: 'Pay_Stub_March.pdf', evidence_type: 'PAY_RECORD', document_date: '2024-03-15', document_date_confidence: 'exact', file_type: 'application/pdf', file_size: 40960 }
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
    getContent: () => Promise.resolve({ success: true, data: '', mimeType: 'text/plain' }),
    reclassify: () => Promise.resolve({ success: true }),
    addDateEntry: () => Promise.resolve({ success: true }),
    removeDateEntry: () => Promise.resolve({ success: true }),
    getDateEntries: () => Promise.resolve({ success: true, entries: [] }),
    setGroup: () => Promise.resolve({ success: true }),
    removeGroup: () => Promise.resolve({ success: true })
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
      { id: 'inc-1', incident_date: '2024-01-24', severity: 'severe', description: 'Negative performance review after complaint', actors_involved: 'Jane Manager' },
      { id: 'inc-2', incident_date: '2024-02-15', severity: 'severe', description: 'Written warning issued', actors_involved: 'Jane Manager, HR Director' },
      { id: 'inc-3', incident_date: '2024-03-15', severity: 'egregious', description: 'Termination', actors_involved: 'Jane Manager, HR Director' }
    ]}),
    create: (data) => Promise.resolve({ success: true, incident: { id: 'inc-new', ...data } }),
    update: () => Promise.resolve({ success: true }),
    delete: () => Promise.resolve({ success: true })
  },
  actors: {
    list: () => Promise.resolve({ success: true, actors: [
      { id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role: 'Direct Supervisor', relationship_to_self: 'supervisor', appearance_count: 5 },
      { id: 'act-2', name: 'Tom HR', classification: 'enabler', role: 'HR Director', relationship_to_self: 'hr', appearance_count: 3 },
      { id: 'act-3', name: 'Sarah Coworker', classification: 'witness_friendly', role: 'Colleague', relationship_to_self: 'coworker', appearance_count: 1 },
      { id: 'act-4', name: 'Mike VP', classification: 'bad_actor', role: 'VP Operations', relationship_to_self: 'upper management', appearance_count: 2 }
    ]}),
    create: (data) => Promise.resolve({ success: true, actor: { id: 'act-new', ...data } }),
    update: () => Promise.resolve({ success: true }),
    delete: () => Promise.resolve({ success: true }),
    merge: () => Promise.resolve({ success: true }),
    getAppearances: () => Promise.resolve({ success: true, appearances: [] }),
    setSelf: () => Promise.resolve({ success: true }),
    checkDuplicates: () => Promise.resolve({ success: true, duplicates: [] }),
    rescan: () => Promise.resolve({ success: true }),
    getForDocument: () => Promise.resolve({ success: true, actors: [] }),
    addToDocument: () => Promise.resolve({ success: true }),
    removeFromDocument: () => Promise.resolve({ success: true })
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
  anchors: {
    list: () => Promise.resolve({ success: true, anchors: [
      { id: 'anc-1', anchor_type: 'START', title: 'Employment Started', anchor_date: '2023-06-15', date_confidence: 'exact', description: 'Started working at Acme Corp as Senior Analyst', is_auto_generated: true, user_edited: false, sort_order: 0, contains_multiple_events: 0, event_count: 1, documents: [], incidents: [], actors: [], precedents: [] },
      { id: 'anc-2', anchor_type: 'REPORTED', title: 'Reported Discrimination to HR', anchor_date: '2024-01-10', date_confidence: 'exact', description: 'Filed formal complaint with HR about discriminatory treatment by supervisor', is_auto_generated: true, user_edited: false, sort_order: 1, contains_multiple_events: 0, event_count: 1, documents: [{ id: 'doc-1', filename: 'Discrimination_Complaint.eml', evidence_type: 'PROTECTED_ACTIVITY' }], incidents: [], actors: [{ id: 'act-2', name: 'Tom HR', classification: 'enabler', role_in_anchor: 'received complaint' }], precedents: [{ precedent_id: 'faragher', relevance_note: 'Reported to employer' }] },
      { id: 'anc-6', anchor_type: 'ADVERSE_ACTION', title: 'Excluded from Key Meetings', anchor_date: '2024-01-20', date_confidence: 'approximate', description: 'After reporting, was systematically excluded from team meetings and decision-making processes', is_auto_generated: true, user_edited: false, sort_order: 2, contains_multiple_events: 1, event_count: 3, documents: [], incidents: [], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role_in_anchor: 'excluded' }], precedents: [{ precedent_id: 'muldrow_some_harm', relevance_note: 'Some harm standard' }] },
      { id: 'anc-7', anchor_type: 'ADVERSE_ACTION', title: 'Gendered Language Used', anchor_date: null, date_confidence: 'unknown', description: 'Manager referred to employee as "sweetheart" and "honey" in professional settings', is_auto_generated: true, user_edited: false, sort_order: 3, contains_multiple_events: 0, event_count: 1, documents: [], incidents: [], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role_in_anchor: 'harasser' }], precedents: [{ precedent_id: 'harris', relevance_note: 'Hostile environment' }] },
      { id: 'anc-3', anchor_type: 'ADVERSE_ACTION', title: 'Written Warning Issued', anchor_date: '2024-02-15', date_confidence: 'exact', description: 'Received written warning 36 days after filing discrimination complaint', severity: 'severe', is_auto_generated: true, user_edited: false, sort_order: 4, contains_multiple_events: 0, event_count: 1, documents: [{ id: 'doc-5', filename: 'Written_Warning.pdf', evidence_type: 'ADVERSE_ACTION' }], incidents: [{ id: 'inc-2', title: 'Written warning', computed_severity: 'severe' }], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role_in_anchor: 'issued warning' }], precedents: [{ precedent_id: 'burlington_northern', relevance_note: 'Materially adverse action' }, { precedent_id: 'thomas_proximity', relevance_note: 'Close temporal proximity' }] },
      { id: 'anc-8', anchor_type: 'ADVERSE_ACTION', title: 'Told to Stop Documenting', anchor_date: '2024-02-20', date_confidence: 'approximate', description: 'Manager told employee to stop documenting workplace issues, suggesting retaliation for protected activity', severity: 'severe', is_auto_generated: true, user_edited: false, sort_order: 5, contains_multiple_events: 0, event_count: 1, documents: [], incidents: [], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role_in_anchor: 'retaliated' }], precedents: [{ precedent_id: 'monaghan_retaliation', relevance_note: 'Dissuade standard' }] },
      { id: 'anc-4', anchor_type: 'REPORTED', title: 'EEOC Charge Filed', anchor_date: '2024-03-01', date_confidence: 'exact', description: 'Filed formal EEOC charge of discrimination', is_auto_generated: true, user_edited: false, sort_order: 6, contains_multiple_events: 0, event_count: 1, documents: [{ id: 'doc-6', filename: 'EEOC_Charge_Filed.pdf', evidence_type: 'PROTECTED_ACTIVITY' }], incidents: [], actors: [], precedents: [{ precedent_id: 'joshua_filing', relevance_note: 'Timely FCHR filing' }] },
      { id: 'anc-5', anchor_type: 'END', title: 'Employment Terminated', anchor_date: '2024-03-15', date_confidence: 'exact', description: 'Terminated 14 days after filing EEOC charge', severity: 'egregious', is_auto_generated: true, user_edited: false, sort_order: 7, contains_multiple_events: 0, event_count: 1, documents: [{ id: 'doc-7', filename: 'Termination_Letter.pdf', evidence_type: 'ADVERSE_ACTION' }], incidents: [{ id: 'inc-3', title: 'Termination', computed_severity: 'egregious' }], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role_in_anchor: 'terminated' }, { id: 'act-2', name: 'Tom HR', classification: 'enabler', role_in_anchor: 'processed termination' }], precedents: [{ precedent_id: 'burlington_northern', relevance_note: 'Materially adverse action' }] }
    ]}),
    generate: () => Promise.resolve({ success: true, count: 8, actorsFound: 2, actors: [{ name: 'Jane Manager', classification: 'bad_actor', id: 'act-1' }, { name: 'Tom HR', classification: 'enabler', id: 'act-2' }] }),
    create: (caseId, data) => Promise.resolve({ success: true, anchor: { id: 'anc-new', ...data } }),
    update: () => Promise.resolve({ success: true }),
    delete: () => Promise.resolve({ success: true }),
    linkEvidence: () => Promise.resolve({ success: true }),
    unlinkEvidence: () => Promise.resolve({ success: true }),
    getRelatedEvidence: (caseId, anchorId) => Promise.resolve({ success: true, anchor: { id: anchorId, anchor_type: 'ADVERSE_ACTION', title: 'Written Warning Issued', anchor_date: '2024-02-15', date_confidence: 'exact', what_happened: 'Received written warning 36 days after filing discrimination complaint. No prior performance issues documented.', where_location: 'HR Office, Building A', impact_summary: 'Created paper trail for eventual termination. Damaged professional reputation.', severity: 'severe', contains_multiple_events: 0, event_count: 1 }, linked: { documents: [{ id: 'doc-5', filename: 'Written_Warning.pdf', evidence_type: 'ADVERSE_ACTION', relevance: 'source' }], incidents: [{ id: 'inc-2', title: 'Written warning issued', computed_severity: 'severe' }], actors: [{ id: 'act-1', name: 'Jane Manager', classification: 'bad_actor', role_in_anchor: 'issued warning' }, { id: 'act-2', name: 'Tom HR', classification: 'enabler', role_in_anchor: 'present in meeting' }], precedents: [{ precedent_id: 'burlington_northern', relevance_note: 'Materially adverse action' }, { precedent_id: 'thomas_proximity', relevance_note: 'Close temporal proximity' }] }, nearby: { documents: [{ id: 'doc-4', filename: 'Coworker_Witness_Statement.pdf' }] } }),
    clone: () => Promise.resolve({ success: true, newId: 'anc-cloned' }),
    reorder: () => Promise.resolve({ success: true }),
    linkPrecedent: () => Promise.resolve({ success: true }),
    unlinkPrecedent: () => Promise.resolve({ success: true }),
    getPrecedents: () => Promise.resolve({ success: true, precedents: [] }),
    breakApart: () => Promise.resolve({ success: true, newAnchors: [{ id: 'anc-split-1', title: 'Part 1' }, { id: 'anc-split-2', title: 'Part 2' }] }),
    linkIncident: () => Promise.resolve({ success: true }),
    unlinkIncident: () => Promise.resolve({ success: true })
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
  dialog: {
    openFiles: () => Promise.resolve({ canceled: true, filePaths: [] })
  }
};
