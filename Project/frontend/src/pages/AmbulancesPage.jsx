import React, { useState, useEffect, useCallback } from 'react';
import {
  Ambulance,
  Fuel,
  MapPin,
  Activity,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Shield,
  Gauge,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Edit2,
  Power,
  ChevronRight,
  X,
  Compass
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import ambulanceService from '../services/ambulanceService';
import hospitalService from '../services/hospitalService';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';

export const AmbulancesPage = () => {
  const { user, role } = useAuth();
  const isAdmin = role === 'ADMIN';
  const isDispatcher = role === 'DISPATCHER';
  const canManageStatus = isAdmin || isDispatcher;

  const [ambulances, setAmbulances] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Modals & Drawers
  const [selectedAmbulance, setSelectedAmbulance] = useState(null);
  const [isCommissionOpen, setIsCommissionOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // Form states
  const [commissionForm, setCommissionForm] = useState({
    fleet_code: '',
    registration_number: '',
    vehicle_type: 'ADVANCED_LIFE_SUPPORT',
    current_hospital_id: 1,
    fuel_level: 100,
    current_location_lat: '',
    current_location_lng: ''
  });

  const [statusForm, setStatusForm] = useState({
    status: 'available',
    fuel_level: 100,
    current_hospital_id: 1,
    message: ''
  });

  const [editForm, setEditForm] = useState({
    fleet_code: '',
    registration_number: '',
    vehicle_type: 'ADVANCED_LIFE_SUPPORT',
    current_hospital_id: 1,
    fuel_level: 100,
    current_location_lat: '',
    current_location_lng: '',
    is_active: true
  });

  // Fetch Ambulances
  const fetchAmbulances = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await ambulanceService.getAmbulances({
        page,
        limit: 20,
        search,
        status: statusFilter,
        vehicle_type: typeFilter,
        is_active: activeFilter
      });
      setAmbulances(res.ambulances || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load ambulance fleet.');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter, activeFilter]);

  // Fetch Hospitals for station selection
  useEffect(() => {
    const fetchHospitalsList = async () => {
      try {
        const res = await hospitalService.getHospitals({ limit: 100 });
        setHospitals(res.hospitals || []);
      } catch (err) {
        console.error('Failed to load hospitals for station selection', err);
      }
    };
    fetchHospitalsList();
  }, []);

  useEffect(() => {
    fetchAmbulances(1);
  }, [fetchAmbulances]);

  // Open Details Drawer
  const handleOpenDetails = async (ambulance) => {
    try {
      const full = await ambulanceService.getAmbulance(ambulance.AmbulanceID);
      setSelectedAmbulance(full);
    } catch (err) {
      setSelectedAmbulance(ambulance);
    }
  };

  // Open Status Modal
  const handleOpenStatusModal = (ambulance, e) => {
    if (e) e.stopPropagation();
    setStatusForm({
      status: ambulance.Status?.toLowerCase() || 'available',
      fuel_level: ambulance.Fuel,
      current_hospital_id: ambulance.CurrentHospitalID,
      message: ''
    });
    setSelectedAmbulance(ambulance);
    setFormError(null);
    setIsStatusModalOpen(true);
  };

  // Submit Status Update
  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAmbulance) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await ambulanceService.updateStatus(selectedAmbulance.AmbulanceID, statusForm);
      setIsStatusModalOpen(false);
      fetchAmbulances(pagination.page);
      if (selectedAmbulance) {
        const updated = await ambulanceService.getAmbulance(selectedAmbulance.AmbulanceID);
        setSelectedAmbulance(updated);
      }
    } catch (err) {
      setFormError(err.message || 'Failed to update status');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (ambulance, e) => {
    if (e) e.stopPropagation();
    setEditForm({
      fleet_code: ambulance.fleet_code || '',
      registration_number: ambulance.registration_number || '',
      vehicle_type: ambulance.vehicle_type || 'ADVANCED_LIFE_SUPPORT',
      current_hospital_id: ambulance.CurrentHospitalID,
      fuel_level: ambulance.Fuel,
      current_location_lat: ambulance.current_location_lat || '',
      current_location_lng: ambulance.current_location_lng || '',
      is_active: ambulance.is_active
    });
    setSelectedAmbulance(ambulance);
    setFormError(null);
    setIsEditModalOpen(true);
  };

  // Submit Edit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAmbulance) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await ambulanceService.updateAmbulance(selectedAmbulance.AmbulanceID, editForm);
      setIsEditModalOpen(false);
      fetchAmbulances(pagination.page);
      const updated = await ambulanceService.getAmbulance(selectedAmbulance.AmbulanceID);
      setSelectedAmbulance(updated);
    } catch (err) {
      setFormError(err.message || 'Failed to update ambulance');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Activation
  const handleToggleActive = async (ambulance, e) => {
    if (e) e.stopPropagation();
    const action = ambulance.is_active ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} ambulance #${ambulance.AmbulanceID} (${ambulance.fleet_code || 'Fleet Unit'})?`)) {
      return;
    }
    try {
      await ambulanceService.updateAmbulance(ambulance.AmbulanceID, { is_active: !ambulance.is_active });
      fetchAmbulances(pagination.page);
      if (selectedAmbulance?.AmbulanceID === ambulance.AmbulanceID) {
        setSelectedAmbulance(prev => ({ ...prev, is_active: !ambulance.is_active }));
      }
    } catch (err) {
      alert(err.message || `Failed to ${action} ambulance`);
    }
  };

  // Submit Commissioning
  const handleCommissionSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setFormError(null);
    try {
      await ambulanceService.createAmbulance(commissionForm);
      setIsCommissionOpen(false);
      setCommissionForm({
        fleet_code: '',
        registration_number: '',
        vehicle_type: 'ADVANCED_LIFE_SUPPORT',
        current_hospital_id: hospitals[0]?.HospitalID || 1,
        fuel_level: 100,
        current_location_lat: '',
        current_location_lng: ''
      });
      fetchAmbulances(1);
    } catch (err) {
      setFormError(err.message || 'Failed to commission ambulance');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = status?.toLowerCase();
    if (s === 'available') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          AVAILABLE
        </span>
      );
    }
    if (s === 'busy') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          BUSY / DISPATCHED
        </span>
      );
    }
    if (s === 'out_of_service') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
          <XCircle className="w-3 h-3 text-rose-400" />
          OUT OF SERVICE
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
        {status?.toUpperCase() || 'UNKNOWN'}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center">
              <Ambulance className="w-5 h-5" />
            </div>
            Ambulance Fleet Directory & Telemetry
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time vehicle status, fuel monitoring, hospital stationing, and fleet commissioning
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchAmbulances(pagination.page)}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            title="Refresh Fleet Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setFormError(null);
                setIsCommissionOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Commission Unit
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
              placeholder="Search by Fleet Code, Reg #, or Legacy ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="available">Available</option>
              <option value="busy">Busy / Dispatched</option>
              <option value="out_of_service">Out of Service</option>
              <option value="maintenance">Maintenance</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Vehicle Types</option>
              <option value="ADVANCED_LIFE_SUPPORT">Advanced Life Support (ALS)</option>
              <option value="BASIC_LIFE_SUPPORT">Basic Life Support (BLS)</option>
              <option value="PATIENT_TRANSPORT">Patient Transport</option>
              <option value="NEONATAL">Neonatal Intensive</option>
            </select>

            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-blue-500"
            >
              <option value="">All Lifecycle</option>
              <option value="true">Active Only</option>
              <option value="false">Deactivated</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${
              viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${
              viewMode === 'table' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <LoadingState message="Fetching live ambulance fleet telemetry..." />
      ) : error ? (
        <ErrorState title="Fleet Query Failed" message={error} onRetry={() => fetchAmbulances(pagination.page)} />
      ) : ambulances.length === 0 ? (
        <EmptyState
          icon={Ambulance}
          title="No Ambulances Found"
          description="No fleet units matched your current filter criteria."
          action={
            isAdmin ? (
              <button
                onClick={() => setIsCommissionOpen(true)}
                className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Commission New Unit
              </button>
            ) : null
          }
        />
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ambulances.map((unit) => {
            const ambId = unit.AmbulanceID || unit.id;
            const fuelVal = unit.Fuel ?? unit.fuel_level ?? 100;
            const isLowFuel = fuelVal < 20;
            const statusVal = unit.Status || unit.status || 'available';
            const stationId = unit.CurrentHospitalID || unit.current_hospital_id;
            const hospitalName = unit.currentHospital?.HospitalName || unit.currentHospital?.name || (stationId ? `Hospital #${stationId}` : 'Unstationed');

            return (
              <div
                key={ambId}
                onClick={() => handleOpenDetails(unit)}
                className={`bg-[#131B2E] border rounded-xl p-4 transition-all cursor-pointer hover:border-blue-500/50 flex flex-col justify-between space-y-4 ${
                  !unit.is_active ? 'opacity-60 border-slate-800' : 'border-[#1F2E4D]'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold font-mono text-xs border border-blue-500/30">
                        #{ambId}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white tracking-wide">
                          {unit.fleet_code || `AMB-${String(ambId).padStart(3, '0')}`}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {unit.registration_number || 'REG: UNREGISTERED'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {getStatusBadge(statusVal)}
                      {!unit.is_active && (
                        <span className="text-[10px] text-rose-400 uppercase font-semibold font-mono">
                          Deactivated
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Vehicle Type */}
                  <div className="text-[11px] text-slate-300 font-medium bg-slate-900/60 px-2.5 py-1 rounded-lg border border-slate-800/80 mb-3 inline-block">
                    {unit.vehicle_type?.replace(/_/g, ' ') || 'ADVANCED LIFE SUPPORT'}
                  </div>

                  {/* Station and Fuel Metrics */}
                  <div className="space-y-2.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" />
                        Station (Legacy Hospital):
                      </span>
                      <span className="font-semibold text-white truncate max-w-[150px]" title={hospitalName}>
                        {hospitalName}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Fuel className="w-3.5 h-3.5 text-slate-500" />
                          Fuel Telemetry:
                        </span>
                        <span className={`font-bold ${isLowFuel ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {unit.Fuel}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isLowFuel ? 'bg-rose-500' : unit.Fuel < 50 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, unit.Fuel))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {canManageStatus && (
                      <button
                        onClick={(e) => handleOpenStatusModal(unit, e)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition-colors"
                      >
                        Update Status
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={(e) => handleOpenEditModal(unit, e)}
                        className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                        title="Edit Properties"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <span className="text-blue-400 flex items-center gap-0.5 text-[11px] font-medium">
                    Telemetry <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B1120] text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Unit #</th>
                  <th className="py-3 px-4">Fleet Code</th>
                  <th className="py-3 px-4">Registration</th>
                  <th className="py-3 px-4">Vehicle Type</th>
                  <th className="py-3 px-4">Stationed Hospital</th>
                  <th className="py-3 px-4">Fuel</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {ambulances.map((unit) => {
                  const isLow = unit.Fuel < 20;
                  return (
                    <tr
                      key={unit.AmbulanceID}
                      onClick={() => handleOpenDetails(unit)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-white">#{unit.AmbulanceID}</td>
                      <td className="py-3 px-4 font-semibold text-white">{unit.fleet_code || '—'}</td>
                      <td className="py-3 px-4 font-mono">{unit.registration_number || '—'}</td>
                      <td className="py-3 px-4">{unit.vehicle_type?.replace(/_/g, ' ') || 'ALS'}</td>
                      <td className="py-3 px-4 text-white">
                        {unit.currentHospital?.HospitalName || `Hospital #${unit.CurrentHospitalID}`}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-mono font-bold ${isLow ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {unit.Fuel}%
                        </span>
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(unit.Status)}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {canManageStatus && (
                            <button
                              onClick={(e) => handleOpenStatusModal(unit, e)}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium"
                            >
                              Status
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              onClick={(e) => handleOpenEditModal(unit, e)}
                              className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Footer */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-400">
          <span>
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total fleet units)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchAmbulances(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white"
            >
              Previous
            </button>
            <button
              onClick={() => fetchAmbulances(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Ambulance Details Drawer */}
      {selectedAmbulance && !isStatusModalOpen && !isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-[#0F172A] border-l border-slate-800 h-full overflow-y-auto p-6 flex flex-col justify-between shadow-2xl">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center font-mono font-bold border border-blue-500/30">
                    #{selectedAmbulance.AmbulanceID}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {selectedAmbulance.fleet_code || `AMB-${selectedAmbulance.AmbulanceID}`}
                    </h3>
                    <p className="text-xs font-mono text-slate-400">
                      Reg: {selectedAmbulance.registration_number || 'Unregistered'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAmbulance(null)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status and Active State */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#131B2E] border border-[#1F2E4D]">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-0.5 font-mono uppercase">Operational State</span>
                  {getStatusBadge(selectedAmbulance.Status)}
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-0.5 font-mono uppercase">Fleet Service</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                      selectedAmbulance.is_active ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
                    }`}
                  >
                    {selectedAmbulance.is_active ? 'ACTIVE' : 'DEACTIVATED'}
                  </span>
                </div>
              </div>

              {/* Separate Location Display: Legacy Hospital Station vs GPS Coordinates */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Stationing & Location</h4>

                <div className="p-3.5 rounded-lg bg-[#131B2E] border border-[#1F2E4D] space-y-2">
                  <div className="flex items-start justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-blue-400" />
                      Stationed Trauma Center:
                    </span>
                    <span className="font-semibold text-white text-right">
                      {selectedAmbulance.currentHospital?.HospitalName || `Hospital #${selectedAmbulance.CurrentHospitalID}`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Legacy network index ID: <span className="font-mono text-blue-300">#{selectedAmbulance.CurrentHospitalID}</span>
                  </p>
                </div>

                <div className="p-3.5 rounded-lg bg-[#131B2E] border border-[#1F2E4D] space-y-2">
                  <div className="flex items-start justify-between text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-purple-400" />
                      GPS Telemetry (Phase 4):
                    </span>
                    <span className="font-mono text-slate-300 text-right">
                      {selectedAmbulance.current_location_lat && selectedAmbulance.current_location_lng
                        ? `${selectedAmbulance.current_location_lat}, ${selectedAmbulance.current_location_lng}`
                        : 'No GPS Stream (Phase 4 Ready)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Hospital index is separate from GPS coordinates to safeguard legacy pathfinding math.
                  </p>
                </div>
              </div>

              {/* Fuel Gauge */}
              <div className="p-4 rounded-lg bg-[#131B2E] border border-[#1F2E4D] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                    <Fuel className="w-4 h-4 text-amber-400" />
                    Fuel Reserve:
                  </span>
                  <span className="font-mono font-bold text-white text-sm">{selectedAmbulance.Fuel}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full ${
                      selectedAmbulance.Fuel < 20 ? 'bg-rose-500' : selectedAmbulance.Fuel < 50 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${selectedAmbulance.Fuel}%` }}
                  />
                </div>
                {selectedAmbulance.Fuel < 20 && (
                  <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Low fuel threshold (&lt;20%). Unit disqualified from dispatch until refueled.
                  </p>
                )}
              </div>

              {/* Timeline Events from C++ / Web Dispatch */}
              {selectedAmbulance.timelineEvents && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    Audit Timeline Events
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedAmbulance.timelineEvents.map((evt) => (
                      <div
                        key={evt.TimelineID}
                        className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                          <span className="text-blue-400 font-semibold">{evt.EventType}</span>
                          <span>{new Date(evt.EventTime).toLocaleTimeString()}</span>
                        </div>
                        <p className="text-slate-300 text-[11px]">{evt.Message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Actions in Drawer */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-3">
              {isAdmin && (
                <button
                  onClick={() => handleToggleActive(selectedAmbulance)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${
                    selectedAmbulance.is_active
                      ? 'border-rose-800/80 text-rose-400 hover:bg-rose-950/40'
                      : 'border-emerald-800/80 text-emerald-400 hover:bg-emerald-950/40'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {selectedAmbulance.is_active ? 'Deactivate' : 'Reactivate'}
                </button>
              )}

              <div className="flex items-center gap-2">
                {canManageStatus && (
                  <button
                    onClick={(e) => handleOpenStatusModal(selectedAmbulance, e)}
                    className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                  >
                    Change Status
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Quick Status Update */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" />
                Update Status — Ambulance #{selectedAmbulance?.AmbulanceID}
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
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Status State</label>
                <select
                  value={statusForm.status}
                  onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="available">AVAILABLE</option>
                  <option value="busy">BUSY / DISPATCHED</option>
                  <option value="out_of_service">OUT OF SERVICE</option>
                  <option value="maintenance">MAINTENANCE</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Fuel Level (0–100%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={statusForm.fuel_level}
                  onChange={(e) => setStatusForm({ ...statusForm, fuel_level: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Stationed Hospital</label>
                <select
                  value={statusForm.current_hospital_id}
                  onChange={(e) => setStatusForm({ ...statusForm, current_hospital_id: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  {hospitals.map((h) => (
                    <option key={h.HospitalID} value={h.HospitalID}>
                      #{h.HospitalID} - {h.HospitalName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Audit Timeline Message (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Refueled and restocked at Central station"
                  value={statusForm.message}
                  onChange={(e) => setStatusForm({ ...statusForm, message: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
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
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Updating...' : 'Save Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Commission Ambulance (Admin Only) */}
      {isCommissionOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                Commission New Ambulance Unit
              </h3>
              <button onClick={() => setIsCommissionOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleCommissionSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Fleet Code</label>
                  <input
                    type="text"
                    placeholder="e.g. AMB-021"
                    value={commissionForm.fleet_code}
                    onChange={(e) => setCommissionForm({ ...commissionForm, fleet_code: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Leave empty to auto-generate.</p>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Registration Number</label>
                  <input
                    type="text"
                    placeholder="e.g. KA-01-EMS-1021"
                    value={commissionForm.registration_number}
                    onChange={(e) => setCommissionForm({ ...commissionForm, registration_number: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Vehicle Capability</label>
                  <select
                    value={commissionForm.vehicle_type}
                    onChange={(e) => setCommissionForm({ ...commissionForm, vehicle_type: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="ADVANCED_LIFE_SUPPORT">Advanced Life Support (ALS)</option>
                    <option value="BASIC_LIFE_SUPPORT">Basic Life Support (BLS)</option>
                    <option value="PATIENT_TRANSPORT">Patient Transport</option>
                    <option value="NEONATAL">Neonatal Intensive Care</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Initial Station Hospital</label>
                  <select
                    value={commissionForm.current_hospital_id}
                    onChange={(e) => setCommissionForm({ ...commissionForm, current_hospital_id: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {hospitals.map((h) => (
                      <option key={h.HospitalID} value={h.HospitalID}>
                        #{h.HospitalID} - {h.HospitalName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Initial Fuel (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={commissionForm.fuel_level}
                    onChange={(e) => setCommissionForm({ ...commissionForm, fuel_level: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Latitude (Opt)</label>
                  <input
                    type="text"
                    placeholder="12.9716"
                    value={commissionForm.current_location_lat}
                    onChange={(e) => setCommissionForm({ ...commissionForm, current_location_lat: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Longitude (Opt)</label>
                  <input
                    type="text"
                    placeholder="77.5946"
                    value={commissionForm.current_location_lng}
                    onChange={(e) => setCommissionForm({ ...commissionForm, current_location_lng: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCommissionOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Commissioning...' : 'Commission Ambulance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Ambulance Properties (Admin Only) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-blue-400" />
                Edit Ambulance Properties — #{selectedAmbulance?.AmbulanceID}
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Fleet Code</label>
                  <input
                    type="text"
                    value={editForm.fleet_code}
                    onChange={(e) => setEditForm({ ...editForm, fleet_code: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Registration Number</label>
                  <input
                    type="text"
                    value={editForm.registration_number}
                    onChange={(e) => setEditForm({ ...editForm, registration_number: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Vehicle Capability</label>
                  <select
                    value={editForm.vehicle_type}
                    onChange={(e) => setEditForm({ ...editForm, vehicle_type: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="ADVANCED_LIFE_SUPPORT">Advanced Life Support (ALS)</option>
                    <option value="BASIC_LIFE_SUPPORT">Basic Life Support (BLS)</option>
                    <option value="PATIENT_TRANSPORT">Patient Transport</option>
                    <option value="NEONATAL">Neonatal Intensive Care</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Station Hospital</label>
                  <select
                    value={editForm.current_hospital_id}
                    onChange={(e) => setEditForm({ ...editForm, current_hospital_id: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                  >
                    {hospitals.map((h) => (
                      <option key={h.HospitalID} value={h.HospitalID}>
                        #{h.HospitalID} - {h.HospitalName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="edit_is_active"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                />
                <label htmlFor="edit_is_active" className="text-slate-300 text-xs">
                  Unit is Active in Operational Fleet
                </label>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AmbulancesPage;
