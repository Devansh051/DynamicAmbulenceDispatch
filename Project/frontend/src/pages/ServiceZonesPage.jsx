import React, { useState, useEffect, useCallback } from 'react';
import {
  Map,
  Compass,
  Search,
  Plus,
  RefreshCw,
  Edit2,
  Power,
  ChevronRight,
  X,
  AlertCircle,
  Radio,
  CheckCircle2,
  Globe
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import zoneService from '../services/zoneService';
import { LoadingState, ErrorState, EmptyState } from '../components/StateFeedback';

export const ServiceZonesPage = () => {
  const { user, role } = useAuth();
  const isAdmin = role === 'ADMIN';

  const [zones, setZones] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Modals & Drawers
  const [selectedZone, setSelectedZone] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [formError, setFormError] = useState(null);

  // Forms
  const [createForm, setCreateForm] = useState({
    zone_code: '',
    name: '',
    description: '',
    center_latitude: '',
    center_longitude: '',
    radius_km: '10.0',
    is_active: true
  });

  const [editForm, setEditForm] = useState({
    zone_code: '',
    name: '',
    description: '',
    center_latitude: '',
    center_longitude: '',
    radius_km: '10.0',
    is_active: true
  });

  const fetchZones = useCallback(async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await zoneService.getZones({
        page,
        limit: 20,
        search,
        is_active: activeFilter
      });
      setZones(res.zones || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      setError(err.message || 'Failed to load dispatch service zones.');
    } finally {
      setLoading(false);
    }
  }, [search, activeFilter]);

  useEffect(() => {
    fetchZones(1);
  }, [fetchZones]);

  const handleOpenEdit = (zone, e) => {
    if (e) e.stopPropagation();
    setEditForm({
      zone_code: zone.zone_code,
      name: zone.name,
      description: zone.description || '',
      center_latitude: zone.center_latitude || '',
      center_longitude: zone.center_longitude || '',
      radius_km: zone.radius_km || '10.0',
      is_active: zone.is_active
    });
    setSelectedZone(zone);
    setFormError(null);
    setIsEditOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setFormError(null);
    try {
      const payload = {
        ...createForm,
        center_latitude: createForm.center_latitude ? parseFloat(createForm.center_latitude) : null,
        center_longitude: createForm.center_longitude ? parseFloat(createForm.center_longitude) : null,
        radius_km: createForm.radius_km ? parseFloat(createForm.radius_km) : null
      };
      await zoneService.createZone(payload);
      setIsCreateOpen(false);
      setCreateForm({
        zone_code: '',
        name: '',
        description: '',
        center_latitude: '',
        center_longitude: '',
        radius_km: '10.0',
        is_active: true
      });
      fetchZones(1);
    } catch (err) {
      setFormError(err.message || 'Failed to create service zone');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedZone) return;
    setActionLoading(true);
    setFormError(null);
    try {
      const payload = {
        ...editForm,
        center_latitude: editForm.center_latitude ? parseFloat(editForm.center_latitude) : null,
        center_longitude: editForm.center_longitude ? parseFloat(editForm.center_longitude) : null,
        radius_km: editForm.radius_km ? parseFloat(editForm.radius_km) : null
      };
      await zoneService.updateZone(selectedZone.id, payload);
      setIsEditOpen(false);
      fetchZones(pagination.page);
      const updated = await zoneService.getZone(selectedZone.id);
      setSelectedZone(updated);
    } catch (err) {
      setFormError(err.message || 'Failed to update service zone');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleActive = async (zone, e) => {
    if (e) e.stopPropagation();
    const action = zone.is_active ? 'deactivate' : 'activate';
    if (!window.confirm(`Are you sure you want to ${action} ${zone.zone_code} (${zone.name})?`)) {
      return;
    }
    try {
      await zoneService.updateStatus(zone.id, !zone.is_active);
      fetchZones(pagination.page);
      if (selectedZone?.id === zone.id) {
        setSelectedZone(prev => ({ ...prev, is_active: !zone.is_active }));
      }
    } catch (err) {
      alert(err.message || `Failed to ${action} zone`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <Map className="w-5 h-5" />
            </div>
            Dispatch Service Zones & Coverage Sectors
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Regional operational boundaries, response centroids, and urban coverage radii
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchZones(pagination.page)}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
            title="Refresh Zones"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setFormError(null);
                setIsCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Sector
            </button>
          )}
        </div>
      </div>

      {/* GIS Architecture Notice Card */}
      <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-5 text-xs text-slate-300 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-indigo-400 flex items-center justify-center shrink-0">
          <Globe className="w-5 h-5" />
        </div>
        <div className="space-y-1.5">
          <span className="font-semibold text-white block">
            Geographic Coverage Architecture (Phase 3 Foundation):
          </span>
          <p className="text-slate-400 leading-relaxed">
            Service zones represent regional dispatch sectors with centroid GPS coordinates and radial response thresholds. Full GIS polygon boundaries, live Heatmaps, and real-time relocations will be integrated in Phase 4 and Phase 6.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by Zone Code, Name, or Coverage Description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#0F172A] border border-slate-700/80 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Sectors</option>
              <option value="true">Active Sectors</option>
              <option value="false">Deactivated Sectors</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${
              viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium ${
              viewMode === 'table' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <LoadingState message="Fetching dispatch service sectors..." />
      ) : error ? (
        <ErrorState title="Service Zone Query Failed" message={error} onRetry={() => fetchZones(pagination.page)} />
      ) : zones.length === 0 ? (
        <EmptyState
          icon={Map}
          title="No Service Zones Found"
          description="No dispatch sectors match your search or filter settings."
          action={
            isAdmin ? (
              <button
                onClick={() => setIsCreateOpen(true)}
                className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                Create New Zone
              </button>
            ) : null
          }
        />
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {zones.map((zone) => (
            <div
              key={zone.id}
              onClick={() => setSelectedZone(zone)}
              className={`bg-[#131B2E] border rounded-xl p-5 transition-all cursor-pointer hover:border-indigo-500/50 flex flex-col justify-between space-y-4 ${
                !zone.is_active ? 'opacity-60 border-slate-800' : 'border-[#1F2E4D]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-mono font-bold text-xs border border-indigo-500/30">
                      <Radio className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[11px] font-mono text-indigo-400 font-bold block">
                        {zone.zone_code}
                      </span>
                      <h4 className="font-bold text-white text-sm line-clamp-1">{zone.name}</h4>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                      zone.is_active ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
                    }`}
                  >
                    {zone.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>

                {zone.description && (
                  <p className="text-xs text-slate-300 line-clamp-2 mt-2 leading-relaxed">
                    {zone.description}
                  </p>
                )}

                <div className="space-y-1.5 pt-3 border-t border-slate-800/80 text-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Compass className="w-3.5 h-3.5 text-slate-500" />
                      Centroid Coordinates:
                    </span>
                    <span className="font-mono text-white text-[11px]">
                      {zone.center_latitude && zone.center_longitude
                        ? `${zone.center_latitude}, ${zone.center_longitude}`
                        : 'Unassigned'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-slate-400">
                    <span>Coverage Radius:</span>
                    <span className="font-mono text-emerald-400 font-bold text-[11px]">
                      {zone.radius_km ? `${zone.radius_km} km` : 'Standard Regional'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                {isAdmin ? (
                  <button
                    onClick={(e) => handleOpenEdit(zone, e)}
                    className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                    title="Edit Zone"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                ) : <span />}

                <span className="text-indigo-400 flex items-center text-[11px] font-semibold">
                  Sector Info <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="bg-[#131B2E] border border-[#1F2E4D] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0B1120] text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Zone Code</th>
                  <th className="py-3 px-4">Sector Name</th>
                  <th className="py-3 px-4">Coverage Description</th>
                  <th className="py-3 px-4">Centroid Coordinates</th>
                  <th className="py-3 px-4">Radius</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {zones.map((zone) => (
                  <tr
                    key={zone.id}
                    onClick={() => setSelectedZone(zone)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-indigo-400">{zone.zone_code}</td>
                    <td className="py-3 px-4 font-bold text-white">{zone.name}</td>
                    <td className="py-3 px-4 text-slate-400 max-w-xs truncate">{zone.description || '—'}</td>
                    <td className="py-3 px-4 font-mono text-slate-300">
                      {zone.center_latitude && zone.center_longitude
                        ? `${zone.center_latitude}, ${zone.center_longitude}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-400 font-semibold">
                      {zone.radius_km ? `${zone.radius_km} km` : '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                          zone.is_active ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
                        }`}
                      >
                        {zone.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {isAdmin && (
                        <button
                          onClick={(e) => handleOpenEdit(zone, e)}
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

      {/* Details Drawer */}
      {selectedZone && !isEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-[#0F172A] border-l border-slate-800 h-full overflow-y-auto p-6 flex flex-col justify-between shadow-2xl">
            <div className="space-y-6">
              <div className="flex items-start justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-mono font-bold border border-indigo-500/30">
                    <Radio className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-mono font-bold text-indigo-400 block">{selectedZone.zone_code}</span>
                    <h3 className="text-base font-bold text-white">{selectedZone.name}</h3>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedZone(null)}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#131B2E] border border-[#1F2E4D] text-xs">
                <span className="text-slate-400 font-mono uppercase">Operational State</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded font-semibold ${
                    selectedZone.is_active ? 'bg-emerald-950/60 text-emerald-400' : 'bg-rose-950/60 text-rose-400'
                  }`}
                >
                  {selectedZone.is_active ? 'ACTIVE' : 'DEACTIVATED'}
                </span>
              </div>

              {/* Description */}
              {selectedZone.description && (
                <div className="p-4 rounded-lg bg-[#131B2E] border border-[#1F2E4D] space-y-1 text-xs">
                  <span className="font-semibold text-white block">Sector Description</span>
                  <p className="text-slate-300 leading-relaxed">{selectedZone.description}</p>
                </div>
              )}

              {/* Centroid & Coverage */}
              <div className="p-4 rounded-lg bg-[#131B2E] border border-[#1F2E4D] space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Centroid Coordinates:</span>
                  <span className="font-mono text-white">
                    {selectedZone.center_latitude && selectedZone.center_longitude
                      ? `${selectedZone.center_latitude}, ${selectedZone.center_longitude}`
                      : 'Not defined'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Radial Coverage Limit:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {selectedZone.radius_km ? `${selectedZone.radius_km} km` : '10.0 km'}
                  </span>
                </div>
              </div>

              {/* GIS Map Visualization Placeholder */}
              <div className="p-4 rounded-lg bg-indigo-950/20 border border-indigo-900/40 space-y-2 text-xs">
                <span className="text-indigo-300 font-semibold block flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  Map Boundary & Polygon Overlays
                </span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Interactive GeoJSON polygon editing and real-time ambulance tracking within this zone are scheduled for Phase 4 (GIS & Fleet Tracking).
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              {isAdmin && (
                <button
                  onClick={() => handleToggleActive(selectedZone)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${
                    selectedZone.is_active
                      ? 'border-rose-800/80 text-rose-400 hover:bg-rose-950/40'
                      : 'border-emerald-800/80 text-emerald-400 hover:bg-emerald-950/40'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {selectedZone.is_active ? 'Deactivate Zone' : 'Reactivate Zone'}
                </button>
              )}

              {isAdmin && (
                <button
                  onClick={(e) => handleOpenEdit(selectedZone, e)}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  Edit Zone
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Zone */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                Create Dispatch Service Zone
              </h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-xs text-rose-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Zone Code</label>
                  <input
                    type="text"
                    placeholder="e.g. ZONE-AIRPORT"
                    value={createForm.zone_code}
                    onChange={(e) => setCreateForm({ ...createForm, zone_code: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white uppercase focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Sector Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Airport Corridor Sector"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Description</label>
                <textarea
                  rows={2}
                  placeholder="Localities, arterial highways, and medical centers covered..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Center Latitude</label>
                  <input
                    type="text"
                    placeholder="13.1986"
                    value={createForm.center_latitude}
                    onChange={(e) => setCreateForm({ ...createForm, center_latitude: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Center Longitude</label>
                  <input
                    type="text"
                    placeholder="77.7066"
                    value={createForm.center_longitude}
                    onChange={(e) => setCreateForm({ ...createForm, center_longitude: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Radius (km)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="100"
                    value={createForm.radius_km}
                    onChange={(e) => setCreateForm({ ...createForm, radius_km: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Creating...' : 'Create Sector'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Zone */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-400" />
                Edit Service Zone — {selectedZone?.zone_code}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Zone Code</label>
                  <input
                    type="text"
                    value={editForm.zone_code}
                    onChange={(e) => setEditForm({ ...editForm, zone_code: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white uppercase focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Sector Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1 font-medium">Description</label>
                <textarea
                  rows={2}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Center Latitude</label>
                  <input
                    type="text"
                    value={editForm.center_latitude}
                    onChange={(e) => setEditForm({ ...editForm, center_latitude: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Center Longitude</label>
                  <input
                    type="text"
                    value={editForm.center_longitude}
                    onChange={(e) => setEditForm({ ...editForm, center_longitude: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 mb-1 font-medium">Radius (km)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="100"
                    value={editForm.radius_km}
                    onChange={(e) => setEditForm({ ...editForm, radius_km: e.target.value })}
                    className="w-full px-3 py-2 bg-[#131B2E] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="zone_is_active"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
                />
                <label htmlFor="zone_is_active" className="text-slate-300 text-xs">
                  Sector is Active for Dispatch Operations
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
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Save Sector'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceZonesPage;
