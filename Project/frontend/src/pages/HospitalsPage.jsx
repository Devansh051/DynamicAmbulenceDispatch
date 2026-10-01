import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Building2,
  MapPin,
  Star,
  Route,
  Search,
  Plus,
  RefreshCw,
  Phone,
  Shield,
  Edit2,
  Power,
  ChevronRight,
  X,
  Ambulance,
  MessageSquare,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  Compass,
  Database,
  Sparkles,
  Navigation,
  Clock,
  Layers,
  Activity
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import hospitalService from '../services/hospitalService';
import ambulanceService from '../services/ambulanceService';
import GoogleMapView from '../components/GoogleMapView';
import HospitalSyncModal from '../components/HospitalSyncModal';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';

export const HospitalsPage = () => {
  const { user, role } = useAuth();
  const isAdmin = role === 'ADMIN';

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialView = searchParams.get('view') || 'grid';

  const [hospitals, setHospitals] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & View
  const [search, setSearch] = useState('');
  const [facilityFilter, setFacilityFilter] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [viewMode, setViewMode] = useState(initialView); // 'nearby' | 'grid' | 'table'

  // Phase 4: Admin Sync Modal State
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Phase 4: Explicit Fallback & Demo Coordinates (Never pretend these are live ambulance tracking)
  const BENGALURU_DEMO_COORDINATES = {
    lat: '12.9716',
    lng: '77.5946',
    label: 'Bengaluru Central (Demo Fallback)'
  };

  const isValidCoordinates = (lat, lng) => {
    const nLat = parseFloat(lat);
    const nLng = parseFloat(lng);
    return !isNaN(nLat) && !isNaN(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
  };

  // Phase 4: Nearby Discovery State with Explicit Origin & Staleness Tracking
  const [nearbyAmbulanceId, setNearbyAmbulanceId] = useState('');
  const [originType, setOriginType] = useState('DEMO_FALLBACK'); // 'AMBULANCE_LIVE_GPS' | 'BROWSER_GPS' | 'MANUAL_CUSTOM' | 'DEMO_FALLBACK'
  const [isGpsStale, setIsGpsStale] = useState(false);
  const [locationTimestamp, setLocationTimestamp] = useState(null);
  const [gpsWarningMessage, setGpsWarningMessage] = useState(null);
  const [nearbyLat, setNearbyLat] = useState(BENGALURU_DEMO_COORDINATES.lat);
  const [nearbyLng, setNearbyLng] = useState(BENGALURU_DEMO_COORDINATES.lng);
  const [nearbyRadius, setNearbyRadius] = useState(15000);
  const [nearbyCandidates, setNearbyCandidates] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState(null);
  const [selectedRouteHospital, setSelectedRouteHospital] = useState(null);
  const [ambulancesList, setAmbulancesList] = useState([]);

  // Modals & Details Drawer
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // Forms
  const [registerForm, setRegisterForm] = useState({
    name: '',
    address: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '',
    facility_type: 'GENERAL_HOSPITAL',
    ownership: 'PRIVATE',
    phone: '',
    latitude: '',
    longitude: ''
  });

  const [editForm, setEditForm] = useState({
    name: '',
    address: '',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '',
    facility_type: 'GENERAL_HOSPITAL',
    ownership: 'PRIVATE',
    phone: '',
    latitude: '',
    longitude: '',
    is_active: true
  });

  const fetchHospitals = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await hospitalService.getHospitals({
        page,
        limit: 20,
        search,
        facility_type: facilityFilter,
        ownership: ownershipFilter,
        is_active: activeFilter
      });
      setHospitals(res.hospitals || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load hospital network.');
    } finally {
      setLoading(false);
    }
  }, [search, facilityFilter, ownershipFilter, activeFilter]);

  useEffect(() => {
    fetchHospitals(1);
  }, [fetchHospitals]);

  // Phase 4: Fetch active ambulances list for nearby selector
  useEffect(() => {
    const loadAmbulances = async () => {
      try {
        const res = await ambulanceService.getAmbulances({ limit: 50 });
        setAmbulancesList(res.ambulances || []);
      } catch (err) {
        console.error('Failed to load ambulances for nearby selector:', err);
      }
    };
    loadAmbulances();
  }, []);

  // Phase 4: Handle ambulance selection with explicit GPS validation and staleness check
  const handleAmbulanceSelect = (ambId) => {
    setNearbyAmbulanceId(ambId);
    if (!ambId) {
      setOriginType('DEMO_FALLBACK');
      setIsGpsStale(false);
      setLocationTimestamp(null);
      setGpsWarningMessage(null);
      setNearbyLat(BENGALURU_DEMO_COORDINATES.lat);
      setNearbyLng(BENGALURU_DEMO_COORDINATES.lng);
      return;
    }

    const selectedAmb = ambulancesList.find(a => String(a.AmbulanceID) === String(ambId));
    if (selectedAmb) {
      const hasGps = isValidCoordinates(selectedAmb.current_location_lat, selectedAmb.current_location_lng);
      const ambTimestamp = selectedAmb.last_location_update || selectedAmb.UpdatedAt;
      const isStale = ambTimestamp ? (Date.now() - new Date(ambTimestamp).getTime() > 15 * 60 * 1000) : true;

      if (hasGps) {
        setOriginType('AMBULANCE_LIVE_GPS');
        setIsGpsStale(isStale);
        setLocationTimestamp(ambTimestamp);
        setGpsWarningMessage(
          isStale
            ? `⚠️ Ambulance GPS location is stale (recorded ${new Date(ambTimestamp).toLocaleTimeString()}). Live route accuracy may be affected.`
            : null
        );
        setNearbyLat(String(selectedAmb.current_location_lat));
        setNearbyLng(String(selectedAmb.current_location_lng));
        handleSearchNearby({
          latitude: selectedAmb.current_location_lat,
          longitude: selectedAmb.current_location_lng,
          ambulance_id: ambId
        });
      } else {
        // Explicitly require fallback without falsely labeling as live GPS
        setOriginType('DEMO_FALLBACK');
        setIsGpsStale(false);
        setLocationTimestamp(null);
        setGpsWarningMessage(
          `⚠️ Ambulance ${selectedAmb.fleet_code || `#${selectedAmb.AmbulanceID}`} does not have an active GPS fix. Showing Bengaluru Central demo reference as fallback.`
        );
        setNearbyLat(BENGALURU_DEMO_COORDINATES.lat);
        setNearbyLng(BENGALURU_DEMO_COORDINATES.lng);
        handleSearchNearby({
          latitude: BENGALURU_DEMO_COORDINATES.lat,
          longitude: BENGALURU_DEMO_COORDINATES.lng,
          ambulance_id: ambId
        });
      }
    }
  };

  // Phase 4: Handle browser geolocation
  const handleBrowserGeolocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        if (!isValidCoordinates(lat, lng)) {
          alert('Received invalid coordinates from browser geolocation.');
          return;
        }
        setNearbyLat(lat);
        setNearbyLng(lng);
        setNearbyAmbulanceId('');
        setOriginType('BROWSER_GPS');
        setIsGpsStale(false);
        setLocationTimestamp(new Date().toISOString());
        setGpsWarningMessage(null);
        handleSearchNearby({ latitude: lat, longitude: lng });
      },
      (err) => {
        alert(`Geolocation error: ${err.message}`);
      }
    );
  };

  // Phase 4: Perform nearby search with coordinate validation
  const handleSearchNearby = async (customParams = {}) => {
    setNearbyLoading(true);
    setNearbyError(null);
    try {
      const lat = customParams.latitude ?? nearbyLat;
      const lng = customParams.longitude ?? nearbyLng;
      const ambId = customParams.ambulance_id ?? nearbyAmbulanceId;
      const rad = customParams.radius ?? nearbyRadius;

      if (!isValidCoordinates(lat, lng)) {
        setNearbyError('Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.');
        setNearbyLoading(false);
        return;
      }

      const data = await hospitalService.getNearbyHospitals({
        lat,
        lng,
        radius: rad,
        ambulance_id: ambId || undefined
      });

      const list = data?.hospitals || [];
      setNearbyCandidates(list);
      if (list.length > 0) {
        setSelectedRouteHospital(list[0]);
      } else {
        setSelectedRouteHospital(null);
      }
    } catch (err) {
      setNearbyError(err.message || 'Failed to scan nearby medical facilities.');
    } finally {
      setNearbyLoading(false);
    }
  };

  // Auto-scan on entering nearby view if empty
  useEffect(() => {
    if (viewMode === 'nearby' && nearbyCandidates.length === 0 && !nearbyLoading) {
      handleSearchNearby();
    }
  }, [viewMode]);

  // Open Details Drawer
  const handleOpenDetails = async (hospital) => {
    try {
      const hospitalId = hospital.HospitalID || hospital.id;
      if (hospitalId) {
        const full = await hospitalService.getHospital(hospitalId);
        setSelectedHospital(full);
      } else {
        setSelectedHospital(hospital);
      }
    } catch (err) {
      setSelectedHospital(hospital);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (hospital, e) => {
    if (e) e.stopPropagation();
    setEditForm({
      name: hospital.HospitalName,
      address: hospital.address || hospital.Location || '',
      city: hospital.city || 'Bengaluru',
      state: hospital.state || 'Karnataka',
      postal_code: hospital.postal_code || '',
      facility_type: hospital.facility_type || 'GENERAL_HOSPITAL',
      ownership: hospital.ownership || 'PRIVATE',
      phone: hospital.phone || '',
      latitude: hospital.latitude || '',
      longitude: hospital.longitude || '',
      is_active: hospital.is_active
    });
    setSelectedHospital(hospital);
    setFormError(null);
    setIsEditOpen(true);
  };

  // Submit Registration
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setFormError(null);
    try {
      await hospitalService.createHospital(registerForm);
      setIsRegisterOpen(false);
      setRegisterForm({
        name: '',
        address: '',
        city: 'Bengaluru',
        state: 'Karnataka',
        postal_code: '',
        facility_type: 'GENERAL_HOSPITAL',
        ownership: 'PRIVATE',
        phone: '',
        latitude: '',
        longitude: ''
      });
      fetchHospitals(1);
    } catch (err) {
      setFormError(err.message || 'Failed to register hospital');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Edit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedHospital) return;
    setActionLoading(true);
    setFormError(null);
    try {
      await hospitalService.updateHospital(selectedHospital.HospitalID, editForm);
      setIsEditOpen(false);
      fetchHospitals(pagination.page);
      const updated = await hospitalService.getHospital(selectedHospital.HospitalID);
      setSelectedHospital(updated);
    } catch (err) {
      setFormError(err.message || 'Failed to update hospital');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Active
  const handleToggleActive = async (hospital, e) => {
    if (e) e.stopPropagation();
    const action = hospital.is_active ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} ${hospital.HospitalName}?`)) {
      return;
    }
    try {
      await hospitalService.updateStatus(hospital.HospitalID, !hospital.is_active);
      fetchHospitals(pagination.page);
      if (selectedHospital?.HospitalID === hospital.HospitalID) {
        setSelectedHospital(prev => ({ ...prev, is_active: !hospital.is_active }));
      }
    } catch (err) {
      alert(err.message || `Failed to ${action} hospital`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            Hospital Network & Trauma Centers
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Registered medical centers, trauma facilities, stationed fleet allocations, and verified patient feedback
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchHospitals(pagination.page)}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            title="Refresh Directory"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-[#131B2E] hover:bg-slate-800 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-semibold shadow-sm transition-all"
            title="Government Directory Synchronization (data.gov.in)"
          >
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Gov Directory Sync</span>
            {isAdmin && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded font-mono">Admin</span>}
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setFormError(null);
                setIsRegisterOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Register Hospital
            </button>
          )}
        </div>
      </div>

      {/* Filter and View Mode Switcher */}
      <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {viewMode !== 'nearby' ? (
          <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by Hospital Name, Locality, or City..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={facilityFilter}
                onChange={(e) => setFacilityFilter(e.target.value)}
                className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Facility Types</option>
                <option value="GENERAL_HOSPITAL">General Hospital</option>
                <option value="TRAUMA_CENTER">Trauma Center</option>
                <option value="SPECIALTY_CLINIC">Specialty Clinic</option>
                <option value="TERTIARY_CARE">Tertiary Care</option>
              </select>

              <select
                value={ownershipFilter}
                onChange={(e) => setOwnershipFilter(e.target.value)}
                className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Ownership</option>
                <option value="PRIVATE">Private</option>
                <option value="PUBLIC">Public / Govt</option>
                <option value="TRUST">Trust / Non-Profit</option>
              </select>

              <select
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
                className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="">All Statuses</option>
                <option value="true">Active Centers</option>
                <option value="false">Deactivated</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center gap-2 text-xs text-slate-300">
            <Compass className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              Dynamic GPS Radar: Discover nearby medical centers, compute driving durations, and trace routes based on active ambulance location.
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 self-end md:self-auto bg-[#0F172A] p-1 rounded-xl border border-slate-800 shrink-0">
          <button
            onClick={() => setViewMode('nearby')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'nearby'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5 text-sky-300" />
            <span>Nearby Discovery & Radar</span>
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'grid'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              viewMode === 'table'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'nearby' ? (
        /* Phase 4: Nearby Discovery & Radar View */
        <div className="space-y-4">
          {/* Nearby Controls Toolbar */}
          <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Ambulance Selector */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 font-medium">Ambulance Unit:</label>
                <select
                  value={nearbyAmbulanceId}
                  onChange={(e) => handleAmbulanceSelect(e.target.value)}
                  className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Choose Ambulance / Custom GPS --</option>
                  {ambulancesList.map((a) => (
                    <option key={a.AmbulanceID} value={a.AmbulanceID}>
                      {a.fleet_code || `Ambulance #${a.AmbulanceID}`} ({a.Status || 'AVAILABLE'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Coordinates */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Lat (e.g. 12.9716)"
                  value={nearbyLat}
                  onChange={(e) => setNearbyLat(e.target.value)}
                  className="w-24 px-2.5 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-white font-mono"
                  title="Latitude"
                />
                <input
                  type="text"
                  placeholder="Lng (e.g. 77.5946)"
                  value={nearbyLng}
                  onChange={(e) => setNearbyLng(e.target.value)}
                  className="w-24 px-2.5 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-white font-mono"
                  title="Longitude"
                />
                <button
                  onClick={handleBrowserGeolocation}
                  type="button"
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700"
                  title="Locate via Browser GPS"
                >
                  <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                </button>
              </div>

              {/* Radius */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 font-medium">Radius:</label>
                <select
                  value={nearbyRadius}
                  onChange={(e) => setNearbyRadius(Number(e.target.value))}
                  className="px-2.5 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                >
                  <option value={5000}>5 km</option>
                  <option value={10000}>10 km</option>
                  <option value={15000}>15 km (Standard)</option>
                  <option value={25000}>25 km (Regional)</option>
                  <option value={50000}>50 km (Extended)</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => handleSearchNearby()}
              disabled={nearbyLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-all shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${nearbyLoading ? 'animate-spin' : ''}`} />
              <span>{nearbyLoading ? 'Scanning...' : 'Scan Nearby Facilities'}</span>
            </button>
          </div>

          {/* Origin & GPS Accuracy Status Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium text-[11px]">Origin Status:</span>
              {originType === 'AMBULANCE_LIVE_GPS' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Live Ambulance GPS Fix {isGpsStale ? '(⚠️ Stale >15m)' : ''}
                </span>
              ) : originType === 'BROWSER_GPS' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-sky-500/10 border border-sky-500/30 text-sky-400">
                  <Navigation className="w-3.5 h-3.5" />
                  Browser Geolocation Fix
                </span>
              ) : originType === 'MANUAL_CUSTOM' ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-purple-500/10 border border-purple-500/30 text-purple-400">
                  <Compass className="w-3.5 h-3.5" />
                  Custom Manual Coordinates
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Demo / Fallback Coordinates (Bengaluru Central)
                </span>
              )}
            </div>

            {locationTimestamp && (
              <span className="text-[11px] text-slate-400 font-mono">
                GPS Fix Timestamp: {new Date(locationTimestamp).toLocaleTimeString()}
              </span>
            )}
          </div>

          {gpsWarningMessage && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{gpsWarningMessage}</span>
            </div>
          )}

          {nearbyError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{nearbyError}</span>
            </div>
          )}

          {/* Main Map + Candidate List */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Interactive Map & Selected Route */}
            <div className="lg:col-span-7 xl:col-span-8 flex flex-col space-y-3">
              <GoogleMapView
                center={{ lat: parseFloat(nearbyLat) || 12.9716, lng: parseFloat(nearbyLng) || 77.5946 }}
                ambulance={ambulancesList.find((a) => String(a.AmbulanceID) === String(nearbyAmbulanceId))}
                hospitals={nearbyCandidates}
                selectedHospital={selectedRouteHospital}
                onSelectHospital={(hosp) => setSelectedRouteHospital(hosp)}
                radiusMeters={nearbyRadius}
                isDemoFallback={originType === 'DEMO_FALLBACK'}
                originType={originType}
                isGpsStale={isGpsStale}
                locationTimestamp={locationTimestamp}
              />

              {selectedRouteHospital && (
                <div className="bg-[#131B2E] border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                      <Route className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-white font-bold">{selectedRouteHospital.name || selectedRouteHospital.HospitalName}</h4>
                      <p className="text-slate-400 text-[11px]">
                        {selectedRouteHospital.address || selectedRouteHospital.Location || 'Address not listed'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 self-end sm:self-auto">
                    <div className="text-right">
                      <span className="text-emerald-400 font-mono font-bold block">
                        {selectedRouteHospital.duration_minutes ? `${selectedRouteHospital.duration_minutes} mins` : 'Est: ~12m'}
                      </span>
                      <span className="text-slate-400 text-[11px] font-mono">
                        {selectedRouteHospital.distance_km ? `${selectedRouteHospital.distance_km} km` : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => handleOpenDetails(selectedRouteHospital)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[11px] font-medium border border-slate-700"
                    >
                      Facility Profile
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Candidate List Side Panel */}
            <div className="lg:col-span-5 xl:col-span-4 flex flex-col space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  Candidate Facilities ({nearbyCandidates.length})
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">Sorted by Travel Time</span>
              </div>

              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {nearbyLoading ? (
                  <div className="text-center py-12 px-4 bg-[#131B2E] border border-slate-800 rounded-xl text-slate-400 text-xs">
                    <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin mx-auto mb-2" />
                    Calculating driving routes and querying places...
                  </div>
                ) : nearbyCandidates.length === 0 ? (
                  <div className="text-center py-12 px-4 bg-[#131B2E] border border-slate-800 rounded-xl text-slate-400 text-xs">
                    No nearby facilities found within {(nearbyRadius / 1000).toFixed(0)} km. Try increasing the search radius.
                  </div>
                ) : (
                  nearbyCandidates.map((hosp, idx) => {
                    const isSelected = selectedRouteHospital && (
                      (hosp.HospitalID && selectedRouteHospital.HospitalID === hosp.HospitalID) ||
                      (hosp.name && selectedRouteHospital.name === hosp.name)
                    );

                    let sourceBadge = (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        NIN Directory
                      </span>
                    );
                    if (hosp.data_source === 'GOOGLE_PLACES') {
                      sourceBadge = (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          Google Places
                        </span>
                      );
                    } else if (hosp.data_source === 'MATCHED_BOTH') {
                      sourceBadge = (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Cross-Matched
                        </span>
                      );
                    }

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedRouteHospital(hosp)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col space-y-2 ${
                          isSelected
                            ? 'bg-slate-800/90 border-sky-500 shadow-md shadow-sky-950/20'
                            : 'bg-[#131B2E] border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h4 className="text-xs font-bold text-white line-clamp-1">{hosp.name || hosp.HospitalName}</h4>
                            <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                              {hosp.address || hosp.Location || 'Address not listed'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-emerald-400 font-mono block">
                              {hosp.duration_minutes ? `${hosp.duration_minutes} min` : 'Est: ~10m'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {hosp.distance_km ? `${hosp.distance_km} km` : ''}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
                          <div className="flex items-center gap-1.5">
                            {sourceBadge}
                            {hosp.verification_status && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-slate-900 border border-slate-800 text-slate-300 font-mono">
                                {hosp.verification_status}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRouteHospital(hosp);
                              }}
                              className="text-sky-400 hover:text-sky-300 font-medium"
                            >
                              Route Line
                            </button>
                            {(hosp.HospitalID || hosp.id) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDetails(hosp);
                                }}
                                className="text-slate-300 hover:text-white font-medium"
                              >
                                Details
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      ) : loading ? (
        <LoadingState message="Querying hospital directory..." />
      ) : error ? (
        <ErrorState title="Directory Query Error" message={error} onRetry={() => fetchHospitals(pagination.page)} />
      ) : hospitals.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No Medical Centers Found"
          description="No hospitals match your search or filter settings."
          action={
            isAdmin ? (
              <button
                onClick={() => setIsRegisterOpen(true)}
                className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Register New Facility
              </button>
            ) : null
          }
        />
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hospitals.map((hosp) => {
            const stationedCount = hosp.stationedAmbulances?.length || 0;
            const availableUnits = hosp.stationedAmbulances?.filter(a => a.Status?.toLowerCase() === 'available').length || 0;

            return (
              <div
                key={hosp.HospitalID}
                onClick={() => handleOpenDetails(hosp)}
                className={`bg-[#131B2E] border rounded-xl p-5 transition-all cursor-pointer hover:border-emerald-500/50 flex flex-col justify-between space-y-4 ${
                  !hosp.is_active ? 'opacity-60 border-slate-800' : 'border-[#1F2E4D]'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs border border-emerald-500/30">
                        #{hosp.HospitalID || hosp.id}
                      </div>
                      <div>
                        <h4 className="font-bold text-white text-sm line-clamp-1" title={hosp.HospitalName || hosp.name}>
                          {hosp.HospitalName || hosp.name}
                        </h4>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {hosp.facility_type?.replace(/_/g, ' ') || 'GENERAL HOSPITAL'}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                        hosp.is_active ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
                      }`}
                    >
                      {hosp.is_active ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>

                  {/* Locality & Ownership */}
                  <div className="space-y-1.5 pt-1 text-xs">
                    <p className="text-slate-300 flex items-center gap-1.5 font-mono">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {hosp.address || hosp.Location || 'Bengaluru, Karnataka'}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        {hosp.ownership || 'PRIVATE'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-blue-950/50 text-blue-300 border border-blue-900/50 font-mono text-[10px]">
                        {hosp.data_source || 'MANUAL'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stationed Ambulances Info & Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Ambulance className="w-3.5 h-3.5 text-blue-400" />
                    <span>
                      <strong className="text-white font-mono">{availableUnits}</strong> / {stationedCount} Available
                    </span>
                  </div>

                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {isAdmin && (
                      <button
                        onClick={(e) => handleOpenEdit(hosp, e)}
                        className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        title="Edit Hospital"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="text-emerald-400 flex items-center text-[11px] font-semibold">
                      Details <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
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
                  <th className="py-3 px-4">ID</th>
                  <th className="py-3 px-4">Hospital Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Locality / Address</th>
                  <th className="py-3 px-4">Ownership</th>
                  <th className="py-3 px-4">Stationed Fleet</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {hospitals.map((hosp) => (
                  <tr
                    key={hosp.HospitalID}
                    onClick={() => handleOpenDetails(hosp)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-white">#{hosp.HospitalID}</td>
                    <td className="py-3 px-4 font-bold text-white">{hosp.HospitalName}</td>
                    <td className="py-3 px-4">{hosp.facility_type?.replace(/_/g, ' ') || 'GENERAL'}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono">
                      {hosp.address || hosp.Location || 'Bengaluru'}
                    </td>
                    <td className="py-3 px-4">{hosp.ownership || 'PRIVATE'}</td>
                    <td className="py-3 px-4 font-mono text-emerald-400">
                      {hosp.stationedAmbulances?.length || 0} Units
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                          hosp.is_active ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
                        }`}
                      >
                        {hosp.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isAdmin && (
                        <button
                          onClick={(e) => handleOpenEdit(hosp, e)}
                          className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hospital Details Drawer */}
      {selectedHospital && !isEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-lg bg-[#0F172A] border-l border-slate-800 h-full overflow-y-auto p-6 flex flex-col justify-between shadow-2xl">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-mono font-bold border border-emerald-500/30">
                    #{selectedHospital.HospitalID}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{selectedHospital.HospitalName}</h3>
                    <p className="text-xs font-mono text-slate-400">
                      {selectedHospital.facility_type?.replace(/_/g, ' ') || 'GENERAL HOSPITAL'} • {selectedHospital.ownership}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedHospital(null)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status & Verification Integrity Indicators */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#131B2E] border border-[#1F2E4D]">
                  <span className="text-[10px] text-slate-400 font-mono uppercase block mb-1">Gov NIN Identifier</span>
                  <span className="text-white font-mono font-semibold block truncate" title={selectedHospital.government_id || 'Not linked'}>
                    {selectedHospital.government_id || 'Legacy Seed / Not Linked'}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[#131B2E] border border-[#1F2E4D]">
                  <span className="text-[10px] text-slate-400 font-mono uppercase block mb-1">Verification Status</span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-medium font-mono">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    {selectedHospital.verification_status || 'VERIFIED'}
                  </span>
                </div>
              </div>

              {/* Address, Contacts & Provenance */}
              <div className="p-4 rounded-lg bg-[#131B2E] border border-[#1F2E4D] space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <MapPin className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>{selectedHospital.address || selectedHospital.Location || 'Bengaluru, Karnataka'}</span>
                </div>
                {selectedHospital.phone && (
                  <div className="flex items-center gap-2 text-slate-300 font-mono">
                    <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>{selectedHospital.phone}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-1 text-[11px] text-slate-400 font-mono">
                  <div className="flex items-center justify-between">
                    <span>Source: <strong className="text-slate-300">{selectedHospital.data_source || 'MANUAL'}</strong></span>
                    <span>Freshness: <strong className="text-emerald-400">{selectedHospital.data_freshness || 'FRESH'}</strong></span>
                  </div>
                  {selectedHospital.latitude && selectedHospital.longitude && (
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>GPS: {selectedHospital.latitude}, {selectedHospital.longitude}</span>
                      {selectedHospital.district && <span>District: {selectedHospital.district}</span>}
                    </div>
                  )}
                  {selectedHospital.last_synced_at && (
                    <div className="text-[10px] text-slate-500">
                      Last Synced: {new Date(selectedHospital.last_synced_at).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Real-Time Operational Availability vs Static Registry Directory */}
              <div className="p-4 rounded-lg bg-[#131B2E] border border-amber-500/30 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 text-[11px]">
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                    Real-Time Operational Availability
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    Not Integrated
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Registry records provide verified geospatial directory data. Live operational metrics (beds, ICU capacity, and on-duty specialists) are not inferred from static directory data or Google Places.
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 block mb-0.5">ICU Beds</span>
                    <span className="text-[11px] font-mono text-slate-400 font-semibold">Unavailable</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 block mb-0.5">General Beds</span>
                    <span className="text-[11px] font-mono text-slate-400 font-semibold">Unavailable</span>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 text-center">
                    <span className="text-[10px] text-slate-400 block mb-0.5">ER Live Status</span>
                    <span className="text-[11px] font-mono text-amber-400 font-semibold">Unknown</span>
                  </div>
                </div>
              </div>

              {/* Stationed Ambulances */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Stationed Fleet Units ({selectedHospital.stationedAmbulances?.length || 0})</span>
                  <span className="text-emerald-400 font-mono text-[11px]">Legacy Network Center</span>
                </h4>

                {selectedHospital.stationedAmbulances?.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedHospital.stationedAmbulances.map((amb) => (
                      <div
                        key={amb.AmbulanceID}
                        className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs flex items-center justify-between font-mono"
                      >
                        <div className="flex items-center gap-2">
                          <Ambulance className="w-3.5 h-3.5 text-blue-400" />
                          <span className="font-bold text-white">#{amb.AmbulanceID}</span>
                        </div>
                        <span
                          className={`text-[10px] font-bold ${
                            amb.Status?.toLowerCase() === 'available' ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {amb.Status?.toUpperCase()} ({amb.Fuel}%)
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                    No fleet ambulances currently stationed at this facility.
                  </p>
                )}
              </div>

              {/* Feedback Ratings */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                    Patient Reviews & Hospital Feedback
                  </h4>
                  {selectedHospital.average_rating > 0 && (
                    <span className="flex items-center gap-1 text-amber-400 font-bold text-xs font-mono">
                      <Star className="w-3.5 h-3.5 fill-current" />
                      {selectedHospital.average_rating} / 5.0
                    </span>
                  )}
                </div>

                {selectedHospital.feedbacks?.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedHospital.feedbacks.map((f) => (
                      <div
                        key={f.FeedbackID}
                        className="p-3 rounded-lg bg-slate-900/60 border border-slate-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-amber-400">
                            {[...Array(f.Rating)].map((_, i) => (
                              <Star key={i} className="w-3 h-3 fill-current" />
                            ))}
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(f.CreatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-slate-300 text-xs">{f.FeedbackText}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-900/40 rounded-lg border border-slate-800">
                    No feedback entries recorded for this hospital.
                  </p>
                )}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              {isAdmin && (
                <button
                  onClick={() => handleToggleActive(selectedHospital)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${
                    selectedHospital.is_active
                      ? 'border-rose-800/80 text-rose-400 hover:bg-rose-950/40'
                      : 'border-emerald-800/80 text-emerald-400 hover:bg-emerald-950/40'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {selectedHospital.is_active ? 'Deactivate Center' : 'Reactivate Center'}
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={(e) => handleOpenEdit(selectedHospital, e)}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  Edit Information
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Register Hospital (Admin Only) */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-400" />
                Register New Hospital Center
              </h3>
              <button onClick={() => setIsRegisterOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Hospital Name</label>
                <input
                  type="text"
                  placeholder="e.g. Apollo Super Specialty (Jayanagar)"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Facility Type</label>
                  <select
                    value={registerForm.facility_type}
                    onChange={(e) => setRegisterForm({ ...registerForm, facility_type: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="GENERAL_HOSPITAL">General Hospital</option>
                    <option value="TRAUMA_CENTER">Trauma Center (Level 1/2)</option>
                    <option value="SPECIALTY_CLINIC">Specialty Clinic</option>
                    <option value="TERTIARY_CARE">Tertiary Care Hospital</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Ownership</label>
                  <select
                    value={registerForm.ownership}
                    onChange={(e) => setRegisterForm({ ...registerForm, ownership: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="PRIVATE">Private</option>
                    <option value="PUBLIC">Public / Govt</option>
                    <option value="TRUST">Trust / Non-Profit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Locality / Address</label>
                <input
                  type="text"
                  placeholder="e.g. 15th Cross, 3rd Block, Jayanagar"
                  value={registerForm.address}
                  onChange={(e) => setRegisterForm({ ...registerForm, address: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">City</label>
                  <input
                    type="text"
                    value={registerForm.city}
                    onChange={(e) => setRegisterForm({ ...registerForm, city: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">State</label>
                  <input
                    type="text"
                    value={registerForm.state}
                    onChange={(e) => setRegisterForm({ ...registerForm, state: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Phone</label>
                  <input
                    type="text"
                    placeholder="+91-80-..."
                    value={registerForm.phone}
                    onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Registering...' : 'Register Facility'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Hospital (Admin Only) */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-emerald-400" />
                Edit Hospital — #{selectedHospital?.HospitalID}
              </h3>
              <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 mb-1 font-medium">Hospital Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Facility Type</label>
                  <select
                    value={editForm.facility_type}
                    onChange={(e) => setEditForm({ ...editForm, facility_type: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="GENERAL_HOSPITAL">General Hospital</option>
                    <option value="TRAUMA_CENTER">Trauma Center</option>
                    <option value="SPECIALTY_CLINIC">Specialty Clinic</option>
                    <option value="TERTIARY_CARE">Tertiary Care</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Ownership</label>
                  <select
                    value={editForm.ownership}
                    onChange={(e) => setEditForm({ ...editForm, ownership: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="PRIVATE">Private</option>
                    <option value="PUBLIC">Public</option>
                    <option value="TRUST">Trust</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Address / Locality</label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">City</label>
                  <input
                    type="text"
                    value={editForm.city}
                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Phone</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="hosp_is_active"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="rounded bg-slate-800 border-slate-700 text-emerald-600 focus:ring-0"
                />
                <label htmlFor="hosp_is_active" className="text-slate-300 text-xs">
                  Center is Active in EMS Network
                </label>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Hospital'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Phase 4: Government Directory 3-Day Synchronization Modal (Admin Only) */}
      <HospitalSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onSyncComplete={() => fetchHospitals(pagination.page)}
      />
    </div>
  );
};

export default HospitalsPage;
