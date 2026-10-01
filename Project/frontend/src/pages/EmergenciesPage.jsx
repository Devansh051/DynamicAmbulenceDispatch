import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Siren,
  AlertTriangle,
  ShieldAlert,
  Search,
  Plus,
  RefreshCw,
  MapPin,
  Clock,
  User,
  HeartPulse,
  Activity,
  CheckCircle,
  XCircle,
  FileText,
  ChevronRight,
  ChevronDown,
  X,
  Compass,
  AlertCircle,
  Navigation,
  Shield,
  ShieldCheck,
  Award,
  Fuel,
  Battery,
  ArrowRight,
  CornerDownRight,
  History,
  Zap,
  Check,
  AlertOctagon,
  Share2,
  Layers,
  Cpu,
  Info,
  Building2,
  Calendar,
  Sparkles,
  PhoneCall,
  Flame,
  Truck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import emergencyService from '../services/emergencyService';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';

// Phase 5 Validated Lifecycle Transitions
const ALLOWED_STATUS_TRANSITIONS = {
  REPORTED: [
    { value: 'VERIFIED', label: 'VERIFIED (Confirmed by Dispatch)', role: 'DISPATCHER' },
    { value: 'CANCELLED', label: 'CANCELLED (False alarm / Caller stand down)', role: 'DISPATCHER' }
  ],
  VERIFIED: [
    { value: 'DISPATCH_RECOMMENDED', label: 'DISPATCH_RECOMMENDED (Candidate Engine Evaluated)', role: 'DISPATCHER' },
    { value: 'DISPATCHED', label: 'DISPATCHED (Ambulance Assigned & Notified)', role: 'DISPATCHER' },
    { value: 'CANCELLED', label: 'CANCELLED (Caller cancelled / Stand down)', role: 'DISPATCHER' }
  ],
  DISPATCH_RECOMMENDED: [
    { value: 'DISPATCHED', label: 'DISPATCHED (Dispatcher Approved & Assigned)', role: 'DISPATCHER' },
    { value: 'CANCELLED', label: 'CANCELLED (Aborted / Duplicate call)', role: 'DISPATCHER' }
  ],
  DISPATCHED: [
    { value: 'EN_ROUTE', label: 'EN_ROUTE (Unit Rolling to Incident Scene)', role: 'CREW' },
    { value: 'RESOLVED', label: 'RESOLVED (Treated on Scene / Cleared)', role: 'DISPATCHER' },
    { value: 'CANCELLED', label: 'CANCELLED (Stand down / Reassigned)', role: 'DISPATCHER' }
  ],
  EN_ROUTE: [
    { value: 'AT_PATIENT', label: 'AT_PATIENT (Unit Arrived at Scene / Patient Contact)', role: 'CREW' },
    { value: 'RESOLVED', label: 'RESOLVED (Delivered / Handled)', role: 'DISPATCHER' },
    { value: 'CANCELLED', label: 'CANCELLED (Unit diverted / Stand down)', role: 'DISPATCHER' }
  ],
  AT_PATIENT: [
    { value: 'TRANSPORTING', label: 'TRANSPORTING (Patient En Route to Trauma Facility)', role: 'CREW' },
    { value: 'RESOLVED', label: 'RESOLVED (Treated at Scene / No Transport Needed)', role: 'DISPATCHER' },
    { value: 'CANCELLED', label: 'CANCELLED (Aborted / Handed off)', role: 'DISPATCHER' }
  ],
  TRANSPORTING: [
    { value: 'AT_HOSPITAL', label: 'AT_HOSPITAL (Arrived at Hospital Trauma Bay)', role: 'CREW' },
    { value: 'RESOLVED', label: 'RESOLVED (Patient Delivered & Handed Over)', role: 'DISPATCHER' },
    { value: 'CANCELLED', label: 'CANCELLED (Diverted / Emergency Aborted)', role: 'DISPATCHER' }
  ],
  AT_HOSPITAL: [
    { value: 'RESOLVED', label: 'RESOLVED (Transfer of Care Complete / Handover Signed)', role: 'DISPATCHER' },
    { value: 'CANCELLED', label: 'CANCELLED (Administrative Abort)', role: 'DISPATCHER' }
  ],
  RESOLVED: [
    { value: 'CLOSED', label: 'CLOSED (Archival & Run-Report Concluded)', role: 'ADMIN' }
  ],
  CLOSED: [],
  CANCELLED: []
};

// Core operational lifecycle steps for visual progress stepper
const LIFECYCLE_STEPS = [
  { key: 'REPORTED', label: 'Intake' },
  { key: 'VERIFIED', label: 'Verified' },
  { key: 'DISPATCH_RECOMMENDED', label: 'Recommended' },
  { key: 'DISPATCHED', label: 'Dispatched' },
  { key: 'EN_ROUTE', label: 'En Route' },
  { key: 'AT_PATIENT', label: 'At Patient' },
  { key: 'TRANSPORTING', label: 'Transporting' },
  { key: 'AT_HOSPITAL', label: 'At Hospital' },
  { key: 'RESOLVED', label: 'Resolved' }
];

export const EmergenciesPage = () => {
  const { user, role } = useAuth();
  const canManage = role === 'ADMIN' || role === 'DISPATCHER';

  // Queue State
  const [emergencies, setEmergencies] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(30);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Selected Emergency & Drawers
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);

  // Action Loading & Errors
  const [actionLoading, setActionLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // Phase 5 Dispatch Recommendation Engine State
  const [dispatchRecommendations, setDispatchRecommendations] = useState(null);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [selectedHospitalId, setSelectedHospitalId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [expiryCountdown, setExpiryCountdown] = useState(null);
  const [showExclusions, setShowExclusions] = useState(false);

  // Hospital Candidates State
  const [hospitalCandidates, setHospitalCandidates] = useState([]);
  const [hospitalsLoading, setHospitalsLoading] = useState(false);

  // Append-only Event History Timeline State
  const [eventHistory, setEventHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Reassignment Form State
  const [eligibleAmbulances, setEligibleAmbulances] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [reassignForm, setReassignForm] = useState({
    new_ambulance_id: '',
    reason: '',
    notes: ''
  });

  // Escalation Form State
  const [escalateForm, setEscalateForm] = useState({
    reason: 'NO_ELIGIBLE_AMBULANCES_AVAILABLE',
    notes: ''
  });

  // Intake Report Form State
  const [reportForm, setReportForm] = useState({
    emergency_type: 'CARDIAC',
    severity: 4,
    location_address: '',
    latitude: '',
    longitude: '',
    description: '',
    patient_id: ''
  });

  // Lifecycle Status Form State
  const [statusForm, setStatusForm] = useState({
    status: '',
    notes: '',
    resolution_notes: '',
    cancellation_reason: ''
  });

  // Fetch Emergencies Queue
  const fetchEmergencies = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await emergencyService.getEmergencies({
        page,
        limit: 20,
        search,
        status: statusFilter,
        emergency_type: typeFilter,
        severity: severityFilter
      });
      setEmergencies(res.emergencies || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
      setLastRefreshed(new Date());
      setSecondsUntilRefresh(30);
    } catch (err) {
      setError(err.message || 'Failed to load emergency queue.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, severityFilter]);

  useEffect(() => {
    fetchEmergencies(1);
  }, [fetchEmergencies]);

  // Dashboard 30s Auto-Refresh Interval
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsUntilRefresh((prev) => {
        if (prev <= 1) {
          fetchEmergencies(pagination.page);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchEmergencies, pagination.page]);

  // Recommendation Expiry Countdown Timer (5-minute TTL)
  useEffect(() => {
    if (!dispatchRecommendations || !dispatchRecommendations.generated_at) {
      setExpiryCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const genTime = new Date(dispatchRecommendations.generated_at).getTime();
      const ttlSec = dispatchRecommendations.ttl_seconds || 300;
      const expireTime = genTime + ttlSec * 1000;
      const remainingMs = expireTime - Date.now();
      const remainingSec = Math.max(0, Math.floor(remainingMs / 1000));
      setExpiryCountdown(remainingSec);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [dispatchRecommendations]);

  // Generate unique idempotency key
  const generateIdempotencyKey = (prefix = 'p5-act') => {
    const randomHex = Math.random().toString(36).substring(2, 10);
    return `${prefix}-${Date.now()}-${randomHex}`;
  };

  // Open Incident Details
  const handleOpenDetails = async (emergency) => {
    try {
      const full = await emergencyService.getEmergency(emergency.id);
      setSelectedEmergency(full);
    } catch (err) {
      setSelectedEmergency(emergency);
    }
  };

  // Open Event Timeline Drawer
  const handleOpenTimeline = async (emergency, e) => {
    if (e) e.stopPropagation();
    setSelectedEmergency(emergency);
    setIsTimelineOpen(true);
    setHistoryLoading(true);
    try {
      const res = await emergencyService.getHistory(emergency.id);
      setEventHistory(res.events || []);
    } catch (err) {
      setFormError(err.message || 'Failed to load timeline events');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Open Status Update Modal
  const handleOpenStatusModal = (emergency, e) => {
    if (e) e.stopPropagation();
    setSelectedEmergency(emergency);
    const allowed = ALLOWED_STATUS_TRANSITIONS[emergency.status] || [];
    setStatusForm({
      status: allowed.length > 0 ? allowed[0].value : '',
      notes: '',
      resolution_notes: emergency.resolution_notes || '',
      cancellation_reason: ''
    });
    setFormError(null);
    setIsStatusModalOpen(true);
  };

  // Open Phase 5 Dispatch Recommendation & Approval Modal
  const handleOpenDispatchModal = async (emergency, e) => {
    if (e) e.stopPropagation();
    setSelectedEmergency(emergency);
    setSelectedCandidateId('');
    setSelectedHospitalId('');
    setOverrideReason('');
    setFormError(null);
    setShowExclusions(false);
    setIdempotencyKey(generateIdempotencyKey(`p5-assign-${emergency.id}`));
    setIsDispatchModalOpen(true);
    setDispatchLoading(true);
    setHospitalsLoading(true);

    try {
      // Parallel fetch: recommendations and hospital candidates
      const [recs, hospitals] = await Promise.all([
        emergencyService.getRecommendations(emergency.id),
        emergencyService.getHospitals(emergency.id).catch(() => ({ hospitals: [] }))
      ]);

      setDispatchRecommendations(recs);
      setHospitalCandidates(hospitals.hospitals || hospitals.data || []);

      // Auto-select rank #1 candidate by default
      if (recs?.candidates?.length > 0) {
        setSelectedCandidateId(String(recs.candidates[0].ambulance_id));
      } else if (recs?.top_candidate) {
        setSelectedCandidateId(String(recs.top_candidate.ambulance_id));
      } else if (recs?.eligible_ambulances?.length > 0) {
        setSelectedCandidateId(String(recs.eligible_ambulances[0].AmbulanceID));
      }

      // Auto-select default hospital if stationed hospital exists
      if (hospitals?.hospitals?.length > 0) {
        setSelectedHospitalId(String(hospitals.hospitals[0].HospitalID));
      }
    } catch (err) {
      setFormError(err.message || 'Failed to load dispatch recommendations');
    } finally {
      setDispatchLoading(false);
      setHospitalsLoading(false);
    }
  };

  // Recalculate Dispatch Recommendations
  const handleRecalculateRecommendations = async () => {
    if (!selectedEmergency) return;
    setRecalculating(true);
    setFormError(null);
    try {
      const recs = await emergencyService.recalculateRecommendations(selectedEmergency.id);
      setDispatchRecommendations(recs);
      setIdempotencyKey(generateIdempotencyKey(`p5-assign-${selectedEmergency.id}`));
      if (recs?.candidates?.length > 0) {
        setSelectedCandidateId(String(recs.candidates[0].ambulance_id));
      }
      setOverrideReason('');
    } catch (err) {
      setFormError(err.message || 'Failed to recalculate recommendations');
    } finally {
      setRecalculating(false);
    }
  };

  // Open Reassign Modal
  const handleOpenReassignModal = async (emergency, e) => {
    if (e) e.stopPropagation();
    setSelectedEmergency(emergency);
    setReassignForm({
      new_ambulance_id: '',
      reason: 'VEHICLE_BREAKDOWN',
      notes: ''
    });
    setFormError(null);
    setIsReassignModalOpen(true);
    setEligibleLoading(true);
    try {
      const data = await emergencyService.getEligibleAmbulances(emergency.id);
      setEligibleAmbulances(data.eligible_ambulances || data.candidates || []);
    } catch (err) {
      setFormError(err.message || 'Failed to load eligible ambulances');
    } finally {
      setEligibleLoading(false);
    }
  };

  // Open Escalate Modal
  const handleOpenEscalateModal = (emergency, e) => {
    if (e) e.stopPropagation();
    setSelectedEmergency(emergency);
    setEscalateForm({
      reason: 'NO_ELIGIBLE_AMBULANCES_AVAILABLE',
      notes: ''
    });
    setFormError(null);
    setIsEscalateModalOpen(true);
  };

  // Submit Phase 5 Dispatch Assignment (Requires Dispatcher Approval)
  const handleConfirmAssignment = async (e) => {
    e.preventDefault();
    if (!selectedEmergency || !selectedCandidateId) {
      setFormError('Please select an eligible candidate ambulance.');
      return;
    }

    // Check if this is an override (selecting candidate other than rank #1)
    const topCandidate = dispatchRecommendations?.top_candidate || dispatchRecommendations?.candidates?.[0];
    const topId = topCandidate ? String(topCandidate.ambulance_id || topCandidate.AmbulanceID) : null;
    const isOverride = topId && selectedCandidateId !== topId;

    if (isOverride && (!overrideReason || overrideReason.trim().length < 5)) {
      setFormError('Dispatcher Override Detected: You have selected an ambulance other than the #1 algorithmic recommendation. An operational override reason (minimum 5 characters) is mandatory.');
      return;
    }

    // Check for expired recommendation
    if (expiryCountdown === 0) {
      setFormError('This recommendation has expired. Please recalculate recommendations to ensure current fleet availability.');
      return;
    }

    setActionLoading(true);
    setFormError(null);

    try {
      await emergencyService.assignAmbulance(selectedEmergency.id, {
        ambulance_id: parseInt(selectedCandidateId, 10),
        hospital_id: selectedHospitalId ? parseInt(selectedHospitalId, 10) : undefined,
        recommendation_id: dispatchRecommendations?.recommendation_id,
        override_reason: isOverride ? overrideReason.trim() : undefined,
        idempotency_key: idempotencyKey
      });

      setIsDispatchModalOpen(false);
      fetchEmergencies(pagination.page);

      // Refresh selected incident in drawer
      const updated = await emergencyService.getEmergency(selectedEmergency.id);
      setSelectedEmergency(updated);
    } catch (err) {
      // Friendly handling for 409 conflict
      if (err.message && (err.message.includes('409') || err.message.includes('already assigned') || err.message.includes('no longer available'))) {
        setFormError(`Assignment Conflict: ${err.message}. Another dispatcher may have assigned this unit. Please recalculate.`);
      } else {
        setFormError(err.message || 'Failed to confirm ambulance assignment');
      }
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Reassignment
  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmergency || !reassignForm.new_ambulance_id) {
      setFormError('Please select a new replacement ambulance.');
      return;
    }
    if (!reassignForm.reason) {
      setFormError('A mandatory reason is required for ambulance reassignment.');
      return;
    }

    setActionLoading(true);
    setFormError(null);

    try {
      await emergencyService.reassignAmbulance(selectedEmergency.id, {
        new_ambulance_id: parseInt(reassignForm.new_ambulance_id, 10),
        reason: reassignForm.reason,
        notes: reassignForm.notes,
        idempotency_key: generateIdempotencyKey(`p5-reassign-${selectedEmergency.id}`)
      });

      setIsReassignModalOpen(false);
      fetchEmergencies(pagination.page);
      const updated = await emergencyService.getEmergency(selectedEmergency.id);
      setSelectedEmergency(updated);
    } catch (err) {
      setFormError(err.message || 'Failed to reassign ambulance');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Escalation
  const handleEscalateSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmergency || !escalateForm.reason) {
      setFormError('Please select an escalation reason.');
      return;
    }

    setActionLoading(true);
    setFormError(null);

    try {
      await emergencyService.escalateEmergency(selectedEmergency.id, {
        reason: escalateForm.reason,
        notes: escalateForm.notes
      });

      setIsEscalateModalOpen(false);
      fetchEmergencies(pagination.page);
      const updated = await emergencyService.getEmergency(selectedEmergency.id);
      setSelectedEmergency(updated);
    } catch (err) {
      setFormError(err.message || 'Failed to escalate emergency');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Status Lifecycle Transition
  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEmergency || !statusForm.status) return;

    setActionLoading(true);
    setFormError(null);

    try {
      await emergencyService.updateLifecycleStatus(selectedEmergency.id, {
        status: statusForm.status,
        notes: statusForm.notes,
        resolution_notes: statusForm.resolution_notes,
        cancellation_reason: statusForm.status === 'CANCELLED' ? statusForm.notes : undefined,
        idempotency_key: generateIdempotencyKey(`p5-status-${selectedEmergency.id}`)
      });

      setIsStatusModalOpen(false);
      fetchEmergencies(pagination.page);
      const updated = await emergencyService.getEmergency(selectedEmergency.id);
      setSelectedEmergency(updated);
    } catch (err) {
      setFormError(err.message || 'Failed to update emergency lifecycle status');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit New Emergency Report
  const handleReportSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setFormError(null);

    try {
      const payload = {
        ...reportForm,
        patient_id: reportForm.patient_id ? parseInt(reportForm.patient_id, 10) : undefined
      };
      await emergencyService.createEmergency(payload);
      setIsReportModalOpen(false);
      setReportForm({
        emergency_type: 'CARDIAC',
        severity: 4,
        location_address: '',
        latitude: '',
        longitude: '',
        description: '',
        patient_id: ''
      });
      fetchEmergencies(1);
    } catch (err) {
      setFormError(err.message || 'Failed to create emergency incident');
    } finally {
      setActionLoading(false);
    }
  };

  // Format Severity Badges (1–5)
  const getSeverityBadge = (severity) => {
    switch (Number(severity)) {
      case 5:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            LEVEL 5 • RESUSCITATION
          </span>
        );
      case 4:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            LEVEL 4 • IMMEDIATE
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            LEVEL 3 • URGENT
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            LEVEL 2 • GUARDED
          </span>
        );
      case 1:
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            LEVEL 1 • NON-URGENT
          </span>
        );
    }
  };

  // Format Phase 5 Lifecycle Status Badges
  const getStatusBadge = (status) => {
    const s = status?.toUpperCase();
    switch (s) {
      case 'REPORTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            REPORTED
          </span>
        );
      case 'VERIFIED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30 font-mono">
            <Shield className="w-3 h-3 text-purple-400" />
            VERIFIED
          </span>
        );
      case 'DISPATCH_RECOMMENDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-mono">
            <Cpu className="w-3 h-3 text-indigo-400" />
            RECOMMENDED
          </span>
        );
      case 'DISPATCHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/20 text-sky-300 border border-sky-500/40 font-mono">
            <Truck className="w-3 h-3 text-sky-400" />
            DISPATCHED
          </span>
        );
      case 'EN_ROUTE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
            <Navigation className="w-3 h-3 text-amber-400 animate-pulse" />
            EN ROUTE
          </span>
        );
      case 'AT_PATIENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40 font-mono">
            <HeartPulse className="w-3 h-3 text-teal-400" />
            AT PATIENT
          </span>
        );
      case 'TRANSPORTING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-violet-500/20 text-violet-300 border border-violet-500/40 font-mono">
            <Activity className="w-3 h-3 text-violet-400 animate-pulse" />
            TRANSPORTING
          </span>
        );
      case 'AT_HOSPITAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">
            <Building2 className="w-3 h-3 text-cyan-400" />
            AT HOSPITAL
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            RESOLVED
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 font-mono">
            <CheckCircle className="w-3 h-3" />
            CLOSED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/40 text-rose-400 border border-rose-800/40 font-mono">
            <XCircle className="w-3 h-3" />
            CANCELLED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700 font-mono">
            {s || 'UNKNOWN'}
          </span>
        );
    }
  };

  // Format Coverage Impact Badge
  const getCoverageBadge = (impact, remaining) => {
    switch (impact?.toUpperCase()) {
      case 'LOW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Shield className="w-2.5 h-2.5" />
            LOW IMPACT {remaining !== undefined ? `(${remaining} in zone)` : ''}
          </span>
        );
      case 'MODERATE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertCircle className="w-2.5 h-2.5" />
            MODERATE {remaining !== undefined ? `(${remaining} left)` : ''}
          </span>
        );
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <AlertTriangle className="w-2.5 h-2.5" />
            HIGH IMPACT (Last unit)
          </span>
        );
      case 'UNKNOWN':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            UNKNOWN (No zone telemetry)
          </span>
        );
    }
  };

  // Format Elapsed Time (Incident Age)
  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return 'Just now';
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ${diffMins % 60}m ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  // Determine top candidate ID for override detection
  const topCandidate = dispatchRecommendations?.top_candidate || dispatchRecommendations?.candidates?.[0];
  const topCandidateId = topCandidate ? String(topCandidate.ambulance_id || topCandidate.AmbulanceID) : null;
  const isSelectedOverride = Boolean(topCandidateId && selectedCandidateId && selectedCandidateId !== topCandidateId);

  return (
    <div className="space-y-6">
      {/* Top Header & Tactical Telemetry HUD */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              PHASE 5 DISPATCH ENGINE ACTIVE
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Synced {lastRefreshed.toLocaleTimeString()} • Auto-refresh in {secondsUntilRefresh}s
            </span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-600/20 text-rose-500 flex items-center justify-center">
              <Siren className="w-5 h-5" />
            </div>
            Emergency Incident Intake & Triage Queue
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Deterministic multi-factor ambulance scoring, human dispatcher approval, reassignments, and emergency lifecycle
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchEmergencies(pagination.page)}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700 flex items-center gap-1.5 text-xs"
            title="Refresh queue immediately"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {canManage && (
            <button
              onClick={() => {
                setFormError(null);
                setIsReportModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all shadow-rose-900/30"
            >
              <Plus className="w-4 h-4" />
              Report Emergency Incident
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Incident Code, Locality, or Situation..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-rose-500 font-mono"
            >
              <option value="">All Statuses</option>
              <option value="REPORTED">REPORTED</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="DISPATCH_RECOMMENDED">DISPATCH_RECOMMENDED</option>
              <option value="DISPATCHED">DISPATCHED</option>
              <option value="EN_ROUTE">EN_ROUTE</option>
              <option value="AT_PATIENT">AT_PATIENT</option>
              <option value="TRANSPORTING">TRANSPORTING</option>
              <option value="AT_HOSPITAL">AT_HOSPITAL</option>
              <option value="RESOLVED">RESOLVED</option>
              <option value="CLOSED">CLOSED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-rose-500"
            >
              <option value="">All Priorities</option>
              <option value="5">Level 5 (Resuscitation)</option>
              <option value="4">Level 4 (Immediate)</option>
              <option value="3">Level 3 (Urgent)</option>
              <option value="2">Level 2 (Guarded)</option>
              <option value="1">Level 1 (Non-Urgent)</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-rose-500"
            >
              <option value="">All Types</option>
              <option value="CARDIAC">Cardiac</option>
              <option value="TRAUMA">Trauma</option>
              <option value="RESPIRATORY">Respiratory</option>
              <option value="STROKE">Stroke</option>
              <option value="ACCIDENT">Accident</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        <div className="text-right text-[11px] text-slate-400 font-mono">
          <span>{pagination.total} Incidents in Queue</span>
        </div>
      </div>

      {/* Main Emergency Queue Table */}
      {loading && emergencies.length === 0 ? (
        <LoadingState message="Connecting to incident dispatch telemetry..." />
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchEmergencies(1)} />
      ) : emergencies.length === 0 ? (
        <EmptyState
          title="No Active Emergency Incidents"
          description="There are currently no emergency incidents matching your active filters."
          action={
            canManage && (
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Report First Incident
              </button>
            )
          }
        />
      ) : (
        <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F172A] text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="py-3 px-4">Incident Code</th>
                  <th className="py-3 px-4">Priority / Severity</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Category & Location</th>
                  <th className="py-3 px-4">Assigned Unit</th>
                  <th className="py-3 px-4">Age</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {emergencies.map((emg) => {
                  const isAssigned = Boolean(emg.assigned_ambulance_id);
                  const isEscalated = Boolean(emg.escalated_at);

                  return (
                    <tr
                      key={emg.id}
                      onClick={() => handleOpenDetails(emg)}
                      className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                        isEscalated ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      {/* Incident Code & Escalation Flag */}
                      <td className="py-3 px-4 font-mono">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white">{emg.incident_code}</span>
                          {isEscalated && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              title={`Escalated: ${emg.escalation_reason || 'Requires manual dispatcher intervention'}`}
                            >
                              <AlertOctagon className="w-2.5 h-2.5 text-amber-400" />
                              ESCALATED
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-500 block">
                          ID #{emg.id}
                        </span>
                      </td>

                      {/* Severity */}
                      <td className="py-3 px-4">
                        {getSeverityBadge(emg.severity)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {getStatusBadge(emg.status)}
                      </td>

                      {/* Category & Address */}
                      <td className="py-3 px-4 max-w-xs truncate">
                        <div className="font-semibold text-white flex items-center gap-1">
                          <span>{emg.emergency_type}</span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 truncate">
                          <MapPin className="w-3 h-3 text-rose-400 shrink-0" />
                          <span className="truncate">{emg.location_address || 'Coordinates only'}</span>
                        </div>
                      </td>

                      {/* Assigned Fleet Unit */}
                      <td className="py-3 px-4 font-mono">
                        {emg.assignedAmbulance ? (
                          <div className="flex items-center gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-sky-400" />
                            <span className="font-bold text-sky-300">
                              {emg.assignedAmbulance.fleet_code || `#${emg.assignedAmbulance.AmbulanceID}`}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                            UNASSIGNED
                          </span>
                        )}
                      </td>

                      {/* Age */}
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {formatTimeAgo(emg.created_at)}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {/* Dispatch Recommend Button for Verified or unassigned incidents */}
                          {canManage && (emg.status === 'VERIFIED' || emg.status === 'DISPATCH_RECOMMENDED' || (!isAssigned && emg.status !== 'RESOLVED' && emg.status !== 'CLOSED' && emg.status !== 'CANCELLED')) && (
                            <button
                              onClick={(e) => handleOpenDispatchModal(emg, e)}
                              className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition-colors shadow-sm shadow-sky-900/40"
                              title="Evaluate Candidates & Approve Dispatch"
                            >
                              <Navigation className="w-3 h-3" />
                              <span>Dispatch</span>
                            </button>
                          )}

                          {/* Reassign Button for Active Assigned Incidents */}
                          {canManage && isAssigned && (emg.status === 'DISPATCHED' || emg.status === 'EN_ROUTE') && (
                            <button
                              onClick={(e) => handleOpenReassignModal(emg, e)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded text-[11px] font-semibold border border-amber-500/30 transition-colors"
                              title="Reassign another unit"
                            >
                              Reassign
                            </button>
                          )}

                          {/* Lifecycle Status Update */}
                          {canManage && emg.status !== 'CLOSED' && emg.status !== 'CANCELLED' && (
                            <button
                              onClick={(e) => handleOpenStatusModal(emg, e)}
                              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
                              title="Update Status"
                            >
                              <Activity className="w-3.5 h-3.5 text-rose-400" />
                            </button>
                          )}

                          {/* Event Timeline */}
                          <button
                            onClick={(e) => handleOpenTimeline(emg, e)}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
                            title="View Append-Only Audit Timeline"
                          >
                            <History className="w-3.5 h-3.5 text-blue-400" />
                          </button>

                          <button
                            onClick={() => handleOpenDetails(emg)}
                            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                            title="Inspect Incident"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="p-3 bg-[#0F172A] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchEmergencies(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchEmergencies(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 rounded"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER: Comprehensive Incident Detail View & Stepper */}
      {/* ========================================================================= */}
      {selectedEmergency && !isDispatchModalOpen && !isStatusModalOpen && !isReassignModalOpen && !isEscalateModalOpen && !isTimelineOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-xl bg-[#0B0F19] border-l border-slate-800 h-full overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-600/20 text-rose-500 flex items-center justify-center font-mono font-bold border border-rose-500/30">
                    <Siren className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white font-mono">{selectedEmergency.incident_code}</h3>
                      {selectedEmergency.escalated_at && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ESCALATED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      Reported by {selectedEmergency.reportedByUser?.name || 'Dispatcher'} • {new Date(selectedEmergency.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedEmergency(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Lifecycle Progress Stepper */}
              <div className="p-4 rounded-xl bg-[#131B2E] border border-[#1F2E4D] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-rose-400" />
                    Operational Response Lifecycle
                  </span>
                  {getStatusBadge(selectedEmergency.status)}
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 pt-2">
                  {LIFECYCLE_STEPS.map((step, idx) => {
                    const currentIdx = LIFECYCLE_STEPS.findIndex((s) => s.key === selectedEmergency.status);
                    const isPassed = currentIdx >= idx;
                    const isCurrent = selectedEmergency.status === step.key;

                    return (
                      <div
                        key={step.key}
                        className={`p-1.5 rounded text-center text-[10px] font-mono border transition-all ${
                          isCurrent
                            ? 'bg-rose-500/20 border-rose-500 text-white font-bold shadow-sm shadow-rose-900/50'
                            : isPassed
                            ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400'
                            : 'bg-slate-900/40 border-slate-800 text-slate-500'
                        }`}
                      >
                        <div className="truncate">{step.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Escalation Alert Banner */}
              {selectedEmergency.escalated_at && (
                <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-amber-300 font-bold">
                    <span className="flex items-center gap-1.5">
                      <AlertOctagon className="w-4 h-4 text-amber-400" />
                      Incident Flagged for Escalated Dispatch Attention
                    </span>
                    <span className="text-[10px] font-mono">{new Date(selectedEmergency.escalated_at).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-slate-300">
                    <strong>Reason:</strong> {selectedEmergency.escalation_reason || 'Manual dispatcher escalation flag'}
                  </p>
                </div>
              )}

              {/* Triage & Severity Card */}
              <div className="p-4 rounded-xl bg-[#131B2E] border border-[#1F2E4D] space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-mono uppercase">Triage Severity</span>
                  {getSeverityBadge(selectedEmergency.severity)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-mono uppercase">Emergency Category</span>
                  <strong className="text-white">{selectedEmergency.emergency_type}</strong>
                </div>
                <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400">
                  <Info className="w-3.5 h-3.5 text-blue-400 inline mr-1" />
                  Severity rating reflects operational response prioritization based on caller presentation. Does not substitute formal clinical diagnosis.
                </div>
              </div>

              {/* Location & Coordinates */}
              <div className="p-4 rounded-xl bg-[#131B2E] border border-[#1F2E4D] space-y-2 text-xs">
                <div className="flex items-start gap-2 text-slate-300">
                  <MapPin className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-white block">Incident Address</span>
                    <span>{selectedEmergency.location_address || 'Address unspecified'}</span>
                  </div>
                </div>
                {selectedEmergency.latitude && selectedEmergency.longitude && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800 text-slate-400 font-mono text-[11px]">
                    <Compass className="w-3.5 h-3.5 text-purple-400" />
                    <span>Coordinates: {selectedEmergency.latitude}, {selectedEmergency.longitude}</span>
                  </div>
                )}
              </div>

              {/* Assigned Fleet Unit & Hospital */}
              <div className="p-4 rounded-xl bg-[#131B2E] border border-[#1F2E4D] space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sky-400 font-bold">
                    <Truck className="w-4 h-4" />
                    Assigned Fleet Ambulance
                  </div>
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                    selectedEmergency.assigned_ambulance_id
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                    {selectedEmergency.assigned_ambulance_id ? 'ASSIGNED' : 'UNASSIGNED'}
                  </span>
                </div>

                {selectedEmergency.assignedAmbulance ? (
                  <div className="space-y-2 pt-1 text-[11px]">
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Fleet Code:</span>
                      <strong className="text-white font-mono text-sm">{selectedEmergency.assignedAmbulance.fleet_code || `#${selectedEmergency.assignedAmbulance.AmbulanceID}`}</strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-300">
                      <span>Vehicle Status:</span>
                      <span className="font-mono text-emerald-400 uppercase">{selectedEmergency.assignedAmbulance.Status}</span>
                    </div>
                    {selectedEmergency.assignedHospital && (
                      <div className="flex items-center justify-between text-slate-300 pt-1 border-t border-slate-800">
                        <span>Designated Hospital:</span>
                        <strong className="text-white">{selectedEmergency.assignedHospital.HospitalName}</strong>
                      </div>
                    )}
                    {selectedEmergency.override_reason && (
                      <div className="p-2 rounded bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-300">
                        <strong>Dispatcher Override Note:</strong> {selectedEmergency.override_reason}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    No ambulance has been confirmed for this incident yet. Click <strong>"Recommend & Approve"</strong> below to evaluate candidate ambulances.
                  </p>
                )}
              </div>

              {/* Clinical Description & Notes */}
              {selectedEmergency.description && (
                <div className="p-4 rounded-xl bg-[#131B2E] border border-[#1F2E4D] space-y-1.5 text-xs">
                  <span className="font-semibold text-white block">Caller Description & Clinical Observations</span>
                  <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {selectedEmergency.description}
                  </p>
                </div>
              )}

              {/* Linked Patient Record */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Linked Patient</h4>
                {selectedEmergency.patient ? (
                  <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">{selectedEmergency.patient.Name}</span>
                      <span className="font-mono text-blue-400">ID #{selectedEmergency.patient.PatientID}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1">
                      <span>Age: {selectedEmergency.patient.Age}</span>
                      <span>Blood Group: {selectedEmergency.patient.BloodGroup}</span>
                      <span className="col-span-2">Condition: {selectedEmergency.patient.Condition || 'Recorded'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-slate-900/40 border border-slate-800 text-xs text-slate-500 italic">
                    Unregistered caller / Walk-in incident (No linked patient record).
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Drawer Actions */}
            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={(e) => handleOpenTimeline(selectedEmergency, e)}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5"
              >
                <History className="w-3.5 h-3.5 text-blue-400" />
                Audit Timeline
              </button>

              <div className="flex items-center gap-2">
                {canManage && !selectedEmergency.escalated_at && selectedEmergency.status !== 'RESOLVED' && selectedEmergency.status !== 'CLOSED' && (
                  <button
                    onClick={(e) => handleOpenEscalateModal(selectedEmergency, e)}
                    className="px-3 py-2 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-xs font-semibold border border-amber-500/30"
                  >
                    Escalate
                  </button>
                )}

                {canManage && selectedEmergency.assigned_ambulance_id && (selectedEmergency.status === 'DISPATCHED' || selectedEmergency.status === 'EN_ROUTE') && (
                  <button
                    onClick={(e) => handleOpenReassignModal(selectedEmergency, e)}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 text-xs font-semibold border border-slate-700"
                  >
                    Reassign Unit
                  </button>
                )}

                {canManage && (selectedEmergency.status === 'VERIFIED' || selectedEmergency.status === 'DISPATCH_RECOMMENDED' || !selectedEmergency.assigned_ambulance_id) && (
                  <button
                    onClick={(e) => handleOpenDispatchModal(selectedEmergency, e)}
                    className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-sky-900/50"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    Recommend & Approve
                  </button>
                )}

                {canManage && selectedEmergency.status !== 'CLOSED' && selectedEmergency.status !== 'CANCELLED' && (
                  <button
                    onClick={(e) => handleOpenStatusModal(selectedEmergency, e)}
                    className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                  >
                    Update Lifecycle
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: Phase 5 Dispatch Recommendation & Dispatcher Approval */}
      {/* ========================================================================= */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-5 shadow-2xl my-8">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-sm flex items-center gap-2 font-mono">
                    <Navigation className="w-4 h-4 text-sky-400" />
                    Ambulance Dispatch Recommendation — {selectedEmergency?.incident_code}
                  </h3>
                </div>
                <span className="text-slate-400 text-[11px] block mt-0.5">
                  Multi-Factor Candidate Scoring Engine • Human Dispatcher Confirmation Required
                </span>
              </div>
              <button
                onClick={() => setIsDispatchModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message */}
            {formError && (
              <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* Recommendation Expiry & Recalculate Bar */}
            {dispatchRecommendations && (
              <div className="p-3 rounded-xl bg-[#131B2E] border border-[#1F2E4D] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-300">
                    Generated: <strong className="font-mono">{new Date(dispatchRecommendations.generated_at).toLocaleTimeString()}</strong>
                  </span>
                  {expiryCountdown !== null && (
                    <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${
                      expiryCountdown <= 0
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        : expiryCountdown < 60
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {expiryCountdown <= 0 ? 'EXPIRED (Recalculate Required)' : `Valid: ${Math.floor(expiryCountdown / 60)}m ${expiryCountdown % 60}s`}
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleRecalculateRecommendations}
                  disabled={recalculating}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
                  <span>{recalculating ? 'Recalculating...' : 'Recalculate'}</span>
                </button>
              </div>
            )}

            {/* Loading State */}
            {dispatchLoading ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                <RefreshCw className="w-6 h-6 text-sky-400 animate-spin mx-auto mb-3" />
                <p className="font-medium text-slate-200">Evaluating Eligible Fleet Ambulances...</p>
                <p className="text-[11px] text-slate-500 mt-1">
                  Querying travel-time ETA (OSRM routing), capability match, zone coverage impact, and telemetry freshness...
                </p>
              </div>
            ) : (
              <form onSubmit={handleConfirmAssignment} className="space-y-4 text-xs">
                {/* Candidates List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-slate-300 font-bold flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-400" />
                      Ranked Candidate Ambulances ({dispatchRecommendations?.candidates?.length || 0}):
                    </label>
                    <span className="text-[11px] text-slate-400">
                      Scored 0–100 (Travel Time 40%, Capability 20%, Coverage 20%, Fuel 10%, Freshness 10%)
                    </span>
                  </div>

                  {(!dispatchRecommendations?.candidates || dispatchRecommendations.candidates.length === 0) ? (
                    <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-xs space-y-2">
                      <div className="flex items-center gap-2 font-bold">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>No Eligible Ambulances Available in Fleet</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed">
                        All commissioned ambulances are currently busy, undergoing maintenance, out-of-service, or below minimum operational fuel (15%).
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setIsDispatchModalOpen(false);
                          handleOpenEscalateModal(selectedEmergency);
                        }}
                        className="mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold"
                      >
                        Escalate for Manual Dispatch Intervention
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                      {dispatchRecommendations.candidates.map((cand) => {
                        const candIdStr = String(cand.ambulance_id || cand.AmbulanceID);
                        const isSelected = selectedCandidateId === candIdStr;
                        const isTop = cand.rank === 1;

                        return (
                          <label
                            key={candIdStr}
                            className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-sky-950/40 border-sky-500 text-white shadow-md shadow-sky-950/50'
                                : 'bg-[#131B2E] border-slate-800 text-slate-300 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <input
                                  type="radio"
                                  name="candidateRadio"
                                  value={candIdStr}
                                  checked={isSelected}
                                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                                  className="accent-sky-500 w-4 h-4"
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-sm text-white">
                                      {cand.fleet_code || `#${cand.ambulance_id}`}
                                    </span>
                                    {isTop && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                        <Sparkles className="w-2.5 h-2.5" />
                                        #1 RECOMMENDED
                                      </span>
                                    )}
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                                      {cand.ambulance_type || 'ALS'}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-slate-400 block mt-0.5">
                                    Base Station: {cand.current_hospital_name || `Hospital #${cand.current_hospital_id || 'HQ'}`}
                                  </span>
                                </div>
                              </div>

                              <div className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <span className="text-xs text-slate-400 font-mono">Score:</span>
                                  <span className="text-sm font-bold font-mono text-emerald-400">
                                    {Math.round(cand.score ?? cand.total_score ?? 0)}/100
                                  </span>
                                </div>
                                <span className="text-[11px] text-sky-400 font-bold font-mono block">
                                  ETA: ~{cand.travel_time_minutes ? `${cand.travel_time_minutes} min` : '4 min'} ({cand.distance_km ? `${cand.distance_km} km` : '2.1 km'})
                                </span>
                              </div>
                            </div>

                            {/* Sub-row telemetry */}
                            <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 font-mono">
                              <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                  <Fuel className="w-3 h-3 text-amber-400" />
                                  Fuel: {cand.fuel ?? cand.fuel_percentage ?? cand.Fuel ?? 0}%
                                </span>
                                <span>
                                  Coverage: {getCoverageBadge(cand.coverage_impact, cand.remaining_zone_units)}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-500">
                                Routing: {cand.route_calculation_method === 'HAVERSINE_STRAIGHT_LINE_FALLBACK' ? '⚠️ Haversine Fallback' : 'OSRM Engine'}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Dispatcher Override Warning & Reason Input */}
                {isSelectedOverride && (
                  <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-700/60 space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-amber-300 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Dispatcher Manual Override Warning</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                      You have selected candidate ambulance <strong>#{selectedCandidateId}</strong> instead of the top-ranked recommendation (<strong>#{topCandidateId}</strong>).
                      To proceed with human approval, a mandatory operational override reason is required for the audit record.
                    </p>
                    <div>
                      <label className="block text-slate-300 font-medium mb-1">
                        Override Reason (Mandatory, min 5 chars): <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Specialized pediatric kit on board, crew already mobilized, route familiarity..."
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        className="w-full px-3 py-2 bg-[#131B2E] border border-amber-600/80 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Exclusions Accordion */}
                {dispatchRecommendations?.exclusions?.length > 0 && (
                  <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-900/40">
                    <button
                      type="button"
                      onClick={() => setShowExclusions(!showExclusions)}
                      className="w-full p-3 flex items-center justify-between text-slate-400 hover:text-white transition-colors text-xs font-semibold"
                    >
                      <span className="flex items-center gap-1.5">
                        <XCircle className="w-3.5 h-3.5 text-slate-500" />
                        Excluded Fleet Units ({dispatchRecommendations.exclusions.length} Disqualified)
                      </span>
                      {showExclusions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    {showExclusions && (
                      <div className="p-3 border-t border-slate-800 space-y-2 text-[11px] font-mono">
                        {dispatchRecommendations.exclusions.map((ex, i) => (
                          <div key={i} className="flex items-start justify-between text-slate-400 bg-slate-950/40 p-2 rounded">
                            <span className="text-white font-bold">{ex.fleet_code || `#${ex.ambulance_id}`}</span>
                            <span className="text-slate-400 max-w-sm text-right">{ex.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Receiving Hospital Destination Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-slate-300 font-medium flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                      Designated Receiving Trauma Center:
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Capacity Confidence: <strong className="text-amber-400">UNKNOWN (No Live Feed)</strong>
                    </span>
                  </div>

                  <select
                    value={selectedHospitalId}
                    onChange={(e) => setSelectedHospitalId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="">-- Use Ambulance Home Station / No Preference --</option>
                    {hospitalCandidates.map((h, i) => {
                      const hid = h.HospitalID || h.hospital_id || h.id;
                      const hname = h.HospitalName || h.name || 'Hospital Facility';
                      const etaStr = h.formatted_duration
                        ? `(ETA: ${h.formatted_duration})`
                        : (h.travel_time_minutes ? `(ETA: ~${Math.round(h.travel_time_minutes)}m)` : '');
                      const sourceBadge = h.data_source === 'GOOGLE_PLACES'
                        ? '📍 Google Maps'
                        : h.data_source === 'MATCHED_BOTH'
                        ? '✓ Verified + Maps'
                        : '🏛️ Registry';

                      return (
                        <option key={hid || i} value={hid || ''}>
                          {hname} {etaStr} [{sourceBadge}] — {h.address || h.Location || 'Bengaluru'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Explicit Human Approval Statement */}
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-white font-bold block mb-0.5">Explicit Human Dispatcher Approval Required</span>
                    Algorithmic candidate recommendations are operational decision support only. Confirming executes atomic assignment, status synchronization, and logs an append-only audit event.
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDispatchModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      actionLoading ||
                      !selectedCandidateId ||
                      (isSelectedOverride && (!overrideReason || overrideReason.trim().length < 5)) ||
                      expiryCountdown === 0
                    }
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-semibold text-xs disabled:opacity-50 flex items-center gap-1.5 shadow-sm shadow-sky-900/40"
                  >
                    <Check className="w-4 h-4" />
                    {actionLoading ? 'Assigning Unit...' : 'Approve & Confirm Assignment'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: Reassign Active Ambulance */}
      {/* ========================================================================= */}
      {isReassignModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2 font-mono">
                <Truck className="w-4 h-4 text-amber-400" />
                Reassign Ambulance — {selectedEmergency?.incident_code}
              </h3>
              <button onClick={() => setIsReassignModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleReassignSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Select Replacement Fleet Ambulance:</label>
                {eligibleLoading ? (
                  <div className="p-2 text-slate-400">Loading candidate fleet units...</div>
                ) : (
                  <select
                    value={reassignForm.new_ambulance_id}
                    onChange={(e) => setReassignForm({ ...reassignForm, new_ambulance_id: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500 font-mono"
                    required
                  >
                    <option value="">-- Choose Replacement Unit --</option>
                    {eligibleAmbulances.map((amb) => (
                      <option key={amb.ambulance_id || amb.AmbulanceID} value={amb.ambulance_id || amb.AmbulanceID}>
                        {amb.fleet_code || `#${amb.ambulance_id || amb.AmbulanceID}`} (Fuel: {amb.fuel_percentage || amb.Fuel}%)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Mandatory Reassignment Reason:</label>
                <select
                  value={reassignForm.reason}
                  onChange={(e) => setReassignForm({ ...reassignForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  required
                >
                  <option value="VEHICLE_BREAKDOWN">Vehicle Mechanical Breakdown / Fault</option>
                  <option value="CLOSER_UNIT_AVAILABLE">Closer Unit Freed Up (Reduced ETA)</option>
                  <option value="CREW_UNAVAILABLE">Crew Medical Stand Down / Shift Limit</option>
                  <option value="CLINICAL_CAPABILITY_UPGRADE">Clinical Capability Upgrade (ALS Required)</option>
                  <option value="OTHER">Other Operational Decision</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Operational Dispatch Notes:</label>
                <textarea
                  rows={2}
                  placeholder="Additional context on reassignment..."
                  value={reassignForm.notes}
                  onChange={(e) => setReassignForm({ ...reassignForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReassignModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !reassignForm.new_ambulance_id}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Executing Reassignment...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: Escalate Emergency Incident */}
      {/* ========================================================================= */}
      {isEscalateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2 font-mono">
                <AlertOctagon className="w-4 h-4 text-amber-400" />
                Escalate Incident — {selectedEmergency?.incident_code}
              </h3>
              <button onClick={() => setIsEscalateModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleEscalateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Escalation Justification:</label>
                <select
                  value={escalateForm.reason}
                  onChange={(e) => setEscalateForm({ ...escalateForm, reason: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                  required
                >
                  <option value="NO_ELIGIBLE_AMBULANCES_AVAILABLE">No Eligible Ambulances in Service Radius</option>
                  <option value="MASS_CASUALTY_INCIDENT">Mass Casualty / Multiple Victims</option>
                  <option value="SEVERE_TRAFFIC_CONGESTION">Severe Traffic Congestion / Impassable Route</option>
                  <option value="HAZMAT_SPECIALIZED_RESPONSE">Hazardous Materials / Specialized Protocol Required</option>
                  <option value="OTHER">Other Supervisor Intervention Required</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Supervisor Notes:</label>
                <textarea
                  rows={3}
                  placeholder="Describe escalation handling, external mutual aid contacted, or instructions..."
                  value={escalateForm.notes}
                  onChange={(e) => setEscalateForm({ ...escalateForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEscalateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Escalating...' : 'Flag as Escalated'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: Update Lifecycle Status */}
      {/* ========================================================================= */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2 font-mono">
                <Activity className="w-4 h-4 text-rose-400" />
                Update Lifecycle — {selectedEmergency?.incident_code}
              </h3>
              <button onClick={() => setIsStatusModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleStatusSubmit} className="space-y-4 text-xs">
              {(!ALLOWED_STATUS_TRANSITIONS[selectedEmergency?.status] || ALLOWED_STATUS_TRANSITIONS[selectedEmergency?.status].length === 0) ? (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-300">
                  Incident #{selectedEmergency?.incident_code} is in a terminal state ({selectedEmergency?.status}).
                </div>
              ) : (
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Permitted Next Lifecycle State:</label>
                  <select
                    value={statusForm.status}
                    onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500 font-mono"
                    required
                  >
                    {(ALLOWED_STATUS_TRANSITIONS[selectedEmergency?.status] || []).map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Operational Transition Notes:</label>
                <textarea
                  rows={3}
                  placeholder="Record timestamp details, clinical observations, or handover notes..."
                  value={statusForm.notes}
                  onChange={(e) => setStatusForm({ ...statusForm, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !statusForm.status}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Updating...' : 'Save Transition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: Append-Only Audit Event Timeline */}
      {/* ========================================================================= */}
      {isTimelineOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2 font-mono">
                  <History className="w-4 h-4 text-blue-400" />
                  Append-Only Event History — {selectedEmergency?.incident_code}
                </h3>
                <span className="text-[11px] text-slate-400">
                  Immutable chronological audit record of all dispatch actions & transitions
                </span>
              </div>
              <button onClick={() => setIsTimelineOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {historyLoading ? (
                <div className="py-8 text-center text-slate-400">Loading audit history...</div>
              ) : eventHistory.length === 0 ? (
                <div className="py-8 text-center text-slate-500 italic">No historical events recorded yet.</div>
              ) : (
                eventHistory.map((evt, idx) => (
                  <div
                    key={evt.id || idx}
                    className="p-3 rounded-xl bg-[#131B2E] border border-slate-800/80 space-y-1 relative"
                  >
                    <div className="flex items-center justify-between text-slate-300">
                      <span className="font-mono font-bold text-white flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-blue-400" />
                        {evt.event_type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(evt.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-2 pt-0.5">
                      <span>Actor: <strong className="text-slate-200">{evt.actor?.name || `User #${evt.created_by_user_id || 'System'}`}</strong> ({evt.actor_role})</span>
                    </div>

                    {evt.notes && (
                      <p className="text-[11px] text-slate-300 pt-1 border-t border-slate-800/60">
                        {evt.notes}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsTimelineOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Close Audit Trail
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 6: Report Emergency Incident Intake */}
      {/* ========================================================================= */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Siren className="w-4 h-4 text-rose-500" />
                Report Emergency Incident Intake
              </h3>
              <button onClick={() => setIsReportModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleReportSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Emergency Category</label>
                  <select
                    value={reportForm.emergency_type}
                    onChange={(e) => setReportForm({ ...reportForm, emergency_type: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="CARDIAC">Cardiac (Chest pain, arrest)</option>
                    <option value="TRAUMA">Trauma (Severe trauma, impact)</option>
                    <option value="RESPIRATORY">Respiratory (Severe distress)</option>
                    <option value="STROKE">Stroke (FAST symptoms)</option>
                    <option value="ACCIDENT">Road Accident / Casualty</option>
                    <option value="OTHER">Other Acute Condition</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Triage Priority Level</label>
                  <select
                    value={reportForm.severity}
                    onChange={(e) => setReportForm({ ...reportForm, severity: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500 font-mono"
                  >
                    <option value="5">Level 5 — Resuscitation (Critical)</option>
                    <option value="4">Level 4 — Immediate (Severe)</option>
                    <option value="3">Level 3 — Urgent (Serious)</option>
                    <option value="2">Level 2 — Guarded (Minor)</option>
                    <option value="1">Level 1 — Non-Urgent (Low)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Incident Address / Locality</label>
                <input
                  type="text"
                  placeholder="e.g. 100 Feet Road, HAL 2nd Stage, Indiranagar"
                  value={reportForm.location_address}
                  onChange={(e) => setReportForm({ ...reportForm, location_address: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Latitude (Opt)</label>
                  <input
                    type="text"
                    placeholder="12.9784"
                    value={reportForm.latitude}
                    onChange={(e) => setReportForm({ ...reportForm, latitude: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Longitude (Opt)</label>
                  <input
                    type="text"
                    placeholder="77.6408"
                    value={reportForm.longitude}
                    onChange={(e) => setReportForm({ ...reportForm, longitude: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Linked Registered Patient ID (Opt)</label>
                <input
                  type="number"
                  placeholder="e.g. 1 to 9"
                  value={reportForm.patient_id}
                  onChange={(e) => setReportForm({ ...reportForm, patient_id: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Caller Observations & Clinical Notes</label>
                <textarea
                  rows={2}
                  placeholder="Describe patient condition, symptoms, caller observations..."
                  value={reportForm.description}
                  onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Submitting...' : 'Queue Incident'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmergenciesPage;
