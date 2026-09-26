/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_USER = {
  name: "Lara Montiano",
  email: "laramontiano@dilg.gov.ph",
  role: "Local Government Operations Officer II",
  office: "Marinduque Provincial Office",
  region: "DILG Region IV-B - MIMAROPA",
  phoneNumber: "0939 374 9823",
  employeeId: "DILG-2026-7689",
};

export const DEFAULT_ATTENDANCE_HISTORY = [
  {
    id: "att-1",
    date: "2026-05-30",
    timeIn: "08:00 AM",
    timeOut: null, // Active
    location: "Boac, Marinduque",
    gpsStatus: "In Range",
    latitude: 13.4474,
    longitude: 121.8344,
    status: "Present",
    selfieUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    fingerprintVerified: true,
    workAssignment: {
      location: "Boac, Marinduque",
      barangayLgu: "Barangay Mand LGU Coordination",
      task: "Barangay Monitoring and LGU Coordination"
    }
  },
  {
    id: "att-2",
    date: "2026-05-29",
    timeIn: "08:15 AM",
    timeOut: "05:00 PM",
    location: "Mogpog, Marinduque",
    gpsStatus: "In Range",
    latitude: 13.4983,
    longitude: 121.8601,
    status: "Present",
    selfieUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    fingerprintVerified: true,
    workAssignment: {
      location: "Mogpog, Marinduque",
      barangayLgu: "Barangay Market Field Inspection",
      task: "Local Market Facility Compliance Check"
    }
  },
  {
    id: "att-3",
    date: "2026-05-28",
    timeIn: "07:55 AM",
    timeOut: "05:02 PM",
    location: "Boac, Marinduque",
    gpsStatus: "In Range",
    latitude: 13.4474,
    longitude: 121.8344,
    status: "Present",
    selfieUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    fingerprintVerified: true,
    workAssignment: {
      location: "Boac, Marinduque",
      barangayLgu: "Provincial Capitol Operations",
      task: "Provincial Council Briefing & Data Entry"
    }
  },
  {
    id: "att-4",
    date: "2026-05-27",
    timeIn: "08:05 AM",
    timeOut: "05:00 PM",
    location: "Gasan, Marinduque",
    gpsStatus: "In Range",
    latitude: 13.3197,
    longitude: 121.8464,
    status: "Present",
    selfieUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
    fingerprintVerified: true,
    workAssignment: {
      location: "Gasan, Marinduque",
      barangayLgu: "Purok 3 Livelihood Center",
      task: "Community Development Project Assessment"
    }
  },
  {
    id: "att-5",
    date: "2026-05-26",
    timeIn: "08:00 AM",
    timeOut: "04:30 PM",
    location: "Boac, Marinduque",
    gpsStatus: "In Range",
    latitude: 13.4474,
    longitude: 121.8344,
    status: "Present",
    selfieUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80",
    fingerprintVerified: true,
    workAssignment: {
      location: "Boac, Marinduque",
      barangayLgu: "Sangguniang Bayan Session Hall",
      task: "LGU Ordinance Review Support"
    }
  }
];

export const DEFAULT_REQUESTS = [
  {
    id: "req-1",
    type: "Leave Request",
    submissionDate: "2026-05-29",
    startDate: "2026-06-03",
    endDate: "2026-06-05",
    purpose: "Annual family reunion & personal rest leave",
    status: "Pending",
    approver: "OIC Provincial Director",
    remarks: "Awaiting final review"
  },
  {
    id: "req-2",
    type: "Travel Order",
    submissionDate: "2026-05-27",
    startDate: "2026-06-01",
    endDate: "2026-06-02",
    purpose: "Attend Regional LGOO Capacity Building Workshop in Lucena City",
    status: "Approved",
    approver: "Regional Director",
    remarks: "Travel budget cleared. Please submit post-activity report within 5 days."
  },
  {
    id: "req-3",
    type: "Travel Order",
    submissionDate: "2026-05-25",
    startDate: "2026-05-28",
    endDate: "2026-05-28",
    purpose: "Field validation of Barangay Peace and Order Council (BPOC) functionality",
    status: "Approved",
    approver: "HR Administrative Officer V",
    remarks: "Travel order approved. Authorized to use provincial LGU service vehicle."
  },
  {
    id: "req-4",
    type: "Leave Request",
    submissionDate: "2026-04-12",
    startDate: "2026-04-15",
    endDate: "2026-04-16",
    purpose: "Dental checkup and follow-up medical appointment",
    status: "Approved",
    approver: "OIC Provincial Director",
    remarks: "Approved as sick leave with pay."
  },
  {
    id: "req-5",
    type: "Leave Request",
    submissionDate: "2026-07-03",
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    purpose: "Leave Type: Vacation Leave. Family outing in Puerto Galera",
    status: "Draft",
    approver: "N/A",
    remarks: "Draft request saved. Not yet submitted for reviews.",
    leaveType: "Vacation Leave",
    detailsType: "Within Philippines",
    detailsSpecify: "Puerto Galera resort",
    commutation: "Not Requested",
    workingDays: 3,
    attachments: []
  }
];

export const DEFAULT_ANNOUNCEMENTS = [
  {
    id: "ann-1",
    title: "New DILG Memorandum Circular 2026-015",
    date: "2026-05-29",
    content: "All LGOOs are directed to guide local chief executives in their jurisdiction regarding the updated Disaster Preparedness and Response Protocol (Revision 3.1). Multi-hazard early response indicators must be cataloged by next Friday.",
    category: "Memorandum",
    referenceNo: "MC-2026-015",
    important: true
  },
  {
    id: "ann-2",
    title: "Provincial Inter-Agency Coordination Meeting",
    date: "2026-05-28",
    content: "The Provincial Meeting will be held on June 9, 2026, at 9:00 AM in the Provincial Capitol Session Hall. Attendance is compulsory for all municipal desk officers and provincial supervisors. Draft agendas can be submitted to Secretariat.",
    category: "Meeting",
    referenceNo: "PM-2026-06-09",
    important: true
  },
  {
    id: "ann-3",
    title: "Updated Field Work Attendance & Overtime Guidelines",
    date: "2026-05-27",
    content: "To improve field-reporting reliability, geofenced clock-ins should be verified within 150 meters of target barangay halls. Ensure mobile GPS high-accuracy setting is active prior to Time In. Regular manual punch request approvals are deprecated.",
    category: "Guidelines",
    referenceNo: "GL-2026-ATT",
    important: false
  },
  {
    id: "ann-4",
    title: "Digital Barangay Governance Portal Training Session",
    date: "2026-05-15",
    content: "Online hands-on walkthrough for the upcoming governance analytics portal. All LGOOs will undergo 3-hour webinar training to facilitate direct coordination with local barangay secretaries.",
    category: "Training",
    referenceNo: "TRN-2026-DBGP",
    important: false
  }
];

export const DEFAULT_EVENTS = [
  {
    id: "evt-1",
    title: "LGOO Capacity Building Workshop",
    date: "2026-06-01",
    time: "08:30 AM",
    type: "training",
    description: "Regional capacity enhancement and performance standard setting for municipal officers.",
    location: "Lucena City, Quezon"
  },
  {
    id: "evt-2",
    title: "Provincial Inter-Agency Assembly",
    date: "2026-06-09",
    time: "09:00 AM",
    type: "meeting",
    description: "Multi-sectoral local governance alignment meeting on environmental compliance.",
    location: "Sangguniang Panlalawigan Hall, Boac"
  },
  {
    id: "evt-3",
    title: "Barangay Lupon Tagapamayapa Evaluation",
    date: "2026-05-30",
    time: "02:00 PM",
    type: "event",
    description: "Review of dispute resolution logs and community justice performance parameters.",
    location: "Barangay Mand, Boac"
  },
  {
    id: "evt-4",
    title: "Provincial Office Regular Staff Meeting",
    date: "2026-06-05",
    time: "03:00 PM",
    type: "meeting",
    description: "Weekly status sync, administrative clarifications, and resource dispatch logistics.",
    location: "Conference Room, Provincial Office"
  }
];

export const DEFAULT_NOTIFICATIONS = [];

export const DEFAULT_SMS_ALERTS = [];
