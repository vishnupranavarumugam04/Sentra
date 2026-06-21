import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
window.L = L;
import 'leaflet.markercluster';
import { 
  Filter, Download, LayoutDashboard, ChevronLeft, MapPin, 
  Layers, AlertOctagon, Trash2, Calendar, Eye, EyeOff, LogOut, CheckCircle2
} from 'lucide-react';

// Marker clustering handler helper component
const createPinIcon = (damageLevel, possibleDuplicate, isLatest) => {
  let color = '#10b981'; // Emerald 500
  if (damageLevel === 'Partially damaged') color = '#eab308'; // Yellow 500
  if (damageLevel === 'Completely damaged') color = '#ef4444'; // Red 500

  const opacity = isLatest ? '1.0' : '0.45';
  const strokeColor = possibleDuplicate ? '#f1f5f9' : '#0f172a';
  const strokeWidth = possibleDuplicate ? '2.5' : '1.5';
  const dashArray = possibleDuplicate ? 'stroke-dasharray="3,3"' : '';

  const svgHtml = `
    <svg width="28" height="36" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 3px 5px rgba(0,0,0,0.45)); opacity: ${opacity};">
      <path d="M15 0C6.71 0 0 6.71 0 15C0 26.25 15 38 15 38C15 38 30 26.25 30 15C30 6.71 23.29 0 15 0ZM15 20.5C11.96 20.5 9.5 18.04 9.5 15C9.5 11.96 11.96 9.5 15 9.5C18.04 9.5 20.5 11.96 20.5 15C20.5 18.04 18.04 20.5 15 20.5Z" 
            fill="${color}" 
            stroke="${strokeColor}" 
            stroke-width="${strokeWidth}" 
            ${dashArray} />
      <circle cx="15" cy="15" r="4.5" fill="#0f172a" />
    </svg>
  `;

  return window.L.divIcon({
    html: svgHtml,
    className: 'custom-pin-icon',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36]
  });
};

function MarkerCluster({ reports, selectedReport, setSelectedReport }) {
  const map = useMap();

  useEffect(() => {
    // Expose selectReportFromPopup globally for Leaflet string popups
    window.selectReportFromPopup = (reportId) => {
      const found = reports.find(r => String(r.id) === String(reportId));
      if (found) setSelectedReport(found);
    };

    return () => {
      delete window.selectReportFromPopup;
    };
  }, [reports, setSelectedReport]);

  useEffect(() => {
    if (!map || !window.L || !window.L.markerClusterGroup) {
      console.warn('[Dashboard Map] Leaflet or MarkerCluster is not initialized yet.');
      return;
    }

    console.log(`[Dashboard Map] Render loop started. Processing ${reports ? reports.length : 0} reports.`);

    // Initialize marker cluster group with severity-prioritized iconCreateFunction
    const mcg = window.L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      iconCreateFunction: function(cluster) {
        const markers = cluster.getAllChildMarkers();
        let maxSeverity = 'Minimal/No damage';
        
        markers.forEach(m => {
          const severity = m.options.damageLevel;
          if (severity === 'Completely damaged') {
            maxSeverity = 'Completely damaged';
          } else if (severity === 'Partially damaged' && maxSeverity !== 'Completely damaged') {
            maxSeverity = 'Partially damaged';
          }
        });

        let badgeClass = 'cluster-badge-minimal';
        if (maxSeverity === 'Completely damaged') badgeClass = 'cluster-badge-complete';
        if (maxSeverity === 'Partially damaged') badgeClass = 'cluster-badge-partial';

        const count = cluster.getChildCount();
        return window.L.divIcon({
          html: `<div class="cluster-badge ${badgeClass}"><span>${count}</span></div>`,
          className: 'custom-cluster-badge',
          iconSize: [42, 42]
        });
      }
    });

    reports.forEach((report, index) => {
      const lat = parseFloat(report.latitude);
      const lng = parseFloat(report.longitude);

      if (isNaN(lat) || isNaN(lng) || report.latitude === null || report.longitude === null) {
        console.warn(`[Dashboard Map] Invalid coordinates found at report index ${index}:`, report);
        return;
      }

      const { damage_level, is_latest, possible_duplicate } = report;
      
      // Create custom SVG pin marker
      const marker = window.L.marker([lat, lng], {
        icon: createPinIcon(damage_level, possible_duplicate, is_latest),
        damageLevel: damage_level // Store in options so the cluster can read it
      });

      // Redesigned premium popup card
      let badgeBg = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      if (damage_level === 'Partially damaged') badgeBg = 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      if (damage_level === 'Completely damaged') badgeBg = 'bg-red-500/20 text-red-400 border border-red-500/30';

      const photoTag = report.photo_url 
        ? `<div class="relative h-20 w-full overflow-hidden rounded-lg mb-2 bg-slate-950 border border-slate-800">
             <img src="${report.photo_url}" class="w-full h-full object-cover" />
           </div>`
        : `<div class="h-10 bg-slate-950 rounded-lg flex items-center justify-center mb-2 border border-slate-800 text-[9px] text-slate-500">No Photo</div>`;

      const popupHtml = `
        <div class="p-1 font-sans max-w-[210px] text-slate-100">
          ${photoTag}
          <div class="flex items-center justify-between mb-1.5 gap-2">
            <span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${badgeBg}">
              ${damage_level.split('/')[0]}
            </span>
            <span class="text-[9px] text-slate-400 font-mono">
              ${new Date(report.submitted_at).toLocaleDateString(undefined, {month:'short', day:'numeric'})}
            </span>
          </div>
          <div class="text-[11px] font-bold text-white mb-1 truncate">
            ${report.infrastructure_type ? report.infrastructure_type.join(', ') : 'Infrastructure'}
          </div>
          <p class="text-[10px] leading-normal text-slate-300 line-clamp-2 mb-2">
            ${report.description_translated || report.description || 'No description.'}
          </p>
          <button onclick="window.selectReportFromPopup('${report.id}')" 
                  class="w-full text-center py-1 bg-blue-600 hover:bg-blue-700 text-[10px] font-bold text-white rounded transition-colors block border-none cursor-pointer">
            View Details
          </button>
        </div>
      `;

      marker.bindPopup(popupHtml);
      marker.on('click', () => {
        setSelectedReport(report);
      });
      mcg.addLayer(marker);
    });

    map.addLayer(mcg);

    return () => {
      map.removeLayer(mcg);
    };
  }, [reports, map]);

  // Recenter and zoom to marker if selectedReport changes
  useEffect(() => {
    if (selectedReport && map) {
      map.setView([selectedReport.latitude, selectedReport.longitude], 16);
    }
  }, [selectedReport, map]);

  return null;
}

export default function Dashboard({ onLogout, onBackToUser }) {
  const [allReports, setAllReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [emergencyAlerts, setEmergencyAlerts] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [toast, setToast] = useState(null);
  
  // Filter States
  const [filterDamage, setFilterDamage] = useState('');
  const [filterInfra, setFilterInfra] = useState('');
  const [filterCrisis, setFilterCrisis] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [showAllVersions, setShowAllVersions] = useState(true); // Show all records by default in admin portal

  // Stats States
  const [stats, setStats] = useState({
    total: 0,
    minimal: 0,
    partial: 0,
    complete: 0,
    hasDebris: 0,
    duplicates: 0,
    infraCounts: {}
  });

  // Toast helper
  const triggerToast = (message) => {
    setToast(message);
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch reports on load
  const fetchReports = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const token = localStorage.getItem('sentra_admin_token');
      // Set Auth Header if exists
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const response = await fetch('/api/reports', { headers });
      if (response.ok) {
        const data = await response.json();
        setAllReports(data.features.map(f => f.properties));
      } else if (response.status === 401) {
        onLogout(); // Token expired or invalid
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmergencyAlerts = async () => {
    try {
      const token = localStorage.getItem('sentra_admin_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const response = await fetch('/api/emergency-alerts', { headers });
      if (response.ok) {
        const data = await response.json();
        setEmergencyAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Error fetching emergency alerts:', error);
    }
  };

  useEffect(() => {
    fetchReports(true);
    fetchEmergencyAlerts();
    
    // Refresh stats and reports every 10 seconds
    const interval = setInterval(() => {
      fetchReports(false);
      fetchEmergencyAlerts();
    }, 10000);

    // Also fetch immediately when user clicks/focuses back on the tab
    const handleFocus = () => {
      fetchReports(false);
      fetchEmergencyAlerts();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Filter and process statistics
  useEffect(() => {
    let reports = [...allReports];

    // Versioning & Duplicate filter:
    // If showAllVersions is false, we filter out non-latest and possible duplicates
    if (!showAllVersions) {
      reports = reports.filter(r => r.is_latest === true && r.possible_duplicate === false);
    }

    // Apply sidebar selectors
    if (filterDamage) {
      reports = reports.filter(r => r.damage_level === filterDamage);
    }
    if (filterInfra) {
      reports = reports.filter(r => r.infrastructure_type.includes(filterInfra));
    }
    if (filterCrisis) {
      reports = reports.filter(r => r.crisis_type.includes(filterCrisis));
    }
    if (filterStartDate) {
      const start = new Date(filterStartDate);
      reports = reports.filter(r => new Date(r.submitted_at) >= start);
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate);
      // End date check includes the full day
      end.setHours(23, 59, 59, 999);
      reports = reports.filter(r => new Date(r.submitted_at) <= end);
    }

    setFilteredReports(reports);

    // Compute Stats
    let minimal = 0, partial = 0, complete = 0, hasDebris = 0, duplicates = 0;
    const infraCounts = {};

    reports.forEach(r => {
      if (r.damage_level === 'Minimal/No damage') minimal++;
      if (r.damage_level === 'Partially damaged') partial++;
      if (r.damage_level === 'Completely damaged') complete++;
      if (r.has_debris) hasDebris++;
      if (r.possible_duplicate) duplicates++;

      r.infrastructure_type.forEach(t => {
        infraCounts[t] = (infraCounts[t] || 0) + 1;
      });
    });

    setStats({
      total: reports.length,
      minimal,
      partial,
      complete,
      hasDebris,
      duplicates,
      infraCounts
    });
  }, [allReports, filterDamage, filterInfra, filterCrisis, filterStartDate, filterEndDate, showAllVersions]);

  const handleExport = (format) => {
    triggerToast(`Generating ${format.toUpperCase()} export...`);
    window.open(`/api/reports/export/${format}`, '_blank');
  };

  const handleLogoutClick = () => {
    localStorage.removeItem('sentra_admin_token');
    onLogout();
  };

  const handleDeleteReport = async (reportId) => {
    try {
      const token = localStorage.getItem('sentra_admin_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const response = await fetch(`/api/reports/${reportId}`, {
        method: 'DELETE',
        headers
      });

      if (response.ok) {
        triggerToast('Report resolved and removed successfully.');
        setSelectedReport(null);
        fetchReports(false);
      } else {
        const data = await response.json();
        triggerToast(`Failed to remove: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error deleting report:', err);
      triggerToast('Network error while attempting to remove report.');
    }
  };

  const handleDeleteAlert = async (alertId) => {
    try {
      const token = localStorage.getItem('sentra_admin_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const response = await fetch(`/api/emergency-alerts/${alertId}`, {
        method: 'DELETE',
        headers
      });
      if (response.ok) {
        triggerToast('Emergency alert removed.');
        fetchEmergencyAlerts();
      } else {
        const data = await response.json();
        triggerToast(`Failed to remove: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error deleting alert:', err);
      triggerToast('Network error while removing alert.');
    }
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-screen bg-slate-950 text-slate-100 overflow-hidden">
      
      {/* LEFT SIDEBAR: Controls & Statistics */}
      <aside className={`w-full md:w-80 lg:w-96 bg-slate-900 border-r border-slate-800 flex flex-col h-[50vh] md:h-full z-10 transition-all duration-300 ${
        isSidebarOpen ? 'flex' : 'hidden'
      }`}>
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <LayoutDashboard className="h-5 w-5 text-blue-500" />
            <h2 className="font-extrabold text-lg tracking-tight">Sentra Admin</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onBackToUser}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Back to User
            </button>
            <button 
              onClick={handleLogoutClick}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
              title="Log Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable control panel */}
        {loading ? (
          <div className="flex-1 p-4 space-y-6 overflow-hidden">
            {/* Skeleton for version manager */}
            <div className="h-12 bg-slate-800/30 border border-slate-800/20 rounded-xl animate-pulse"></div>
            {/* Skeleton for filters */}
            <div className="space-y-2">
              <div className="h-3 bg-slate-800/30 w-1/4 rounded animate-pulse"></div>
              <div className="h-10 bg-slate-800/30 rounded-xl animate-pulse"></div>
              <div className="h-10 bg-slate-800/30 rounded-xl animate-pulse"></div>
              <div className="h-10 bg-slate-800/30 rounded-xl animate-pulse"></div>
            </div>
            {/* Skeleton for stats */}
            <div className="space-y-2">
              <div className="h-3 bg-slate-800/30 w-1/3 rounded animate-pulse"></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-16 bg-slate-800/30 rounded-xl animate-pulse"></div>
                <div className="h-16 bg-slate-800/30 rounded-xl animate-pulse"></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            
            {/* Versioning & Duplicate Filters */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Version Management</h3>
              
              <button
                onClick={() => {
                  setShowAllVersions(!showAllVersions);
                  triggerToast(showAllVersions ? "Showing active latest reports only" : "Showing all reports including historical and duplicates");
                }}
                className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                  showAllVersions 
                    ? 'bg-blue-600/10 border-blue-500 text-blue-300' 
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  {showAllVersions ? <Eye className="h-4.5 w-4.5" /> : <EyeOff className="h-4.5 w-4.5" />}
                  <span className="text-xs font-semibold">Show historical & duplicates</span>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  showAllVersions ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}>
                  {showAllVersions ? 'Active' : 'Off'}
                </span>
              </button>
            </div>

            {/* Filters Form */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
                <Filter className="h-3.5 w-3.5" />
                <span>Filters</span>
              </h3>
              
              <div className="space-y-2">
                <select
                  value={filterDamage}
                  onChange={(e) => setFilterDamage(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All Damage Levels</option>
                  <option value="Minimal/No damage">Minimal/No damage</option>
                  <option value="Partially damaged">Partially damaged</option>
                  <option value="Completely damaged">Completely damaged</option>
                </select>

                <select
                  value={filterInfra}
                  onChange={(e) => setFilterInfra(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All Infrastructure Types</option>
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Government">Government</option>
                  <option value="Utility">Utility</option>
                  <option value="Transport & Communication">Transport & Communication</option>
                  <option value="Community">Community</option>
                  <option value="Public Spaces/Recreation">Public Spaces/Recreation</option>
                  <option value="Other">Other</option>
                </select>

                <select
                  value={filterCrisis}
                  onChange={(e) => setFilterCrisis(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All Crisis Types</option>
                  <option value="Earthquake">Earthquake</option>
                  <option value="Flood">Flood</option>
                  <option value="Tsunami">Tsunami</option>
                  <option value="Hurricane/Cyclone">Hurricane/Cyclone</option>
                  <option value="Wildfire">Wildfire</option>
                  <option value="Explosion">Explosion</option>
                  <option value="Chemical incident">Chemical incident</option>
                  <option value="Conflict">Conflict</option>
                  <option value="Civil unrest">Civil unrest</option>
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Start Date</label>
                    <input 
                      type="date"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="w-full px-2 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">End Date</label>
                    <input 
                      type="date"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="w-full px-2 py-2 bg-slate-950 border border-slate-850 rounded-xl text-xs text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Analytics */}
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Statistics Panel</h3>

              {emergencyAlerts.length > 0 && (
                <div className="space-y-2 bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-red-300 font-bold uppercase block">Emergency Alerts</span>
                    <span className="text-[10px] text-red-200 font-semibold">{emergencyAlerts.length} total</span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {emergencyAlerts.slice(0, 5).map((alert) => (
                      <div key={alert.id} className={`relative rounded-lg p-3 border ${alert.acknowledged ? 'bg-slate-950/40 border-slate-800' : 'bg-red-600/15 border-red-500/30'}`}>
                        <button 
                          onClick={() => handleDeleteAlert(alert.id)}
                          className="absolute top-2 right-2 p-1 text-slate-400 hover:text-red-400 transition-colors"
                          title="Remove Alert"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <div className="flex items-center justify-between gap-2 pr-6">
                          <span className="text-xs font-bold text-white">{alert.alert_type || 'SOS'}</span>
                          <span className={`text-[10px] font-bold uppercase ${alert.acknowledged ? 'text-slate-400' : 'text-red-300'}`}>{alert.acknowledged ? 'ACKNOWLEDGED' : 'NEW'}</span>
                        </div>
                        <div className="text-[11px] text-slate-300 mt-1">{alert.message}</div>
                        <div className="text-[10px] text-slate-400 mt-1">{new Date(alert.created_at).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Top Cards grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Pins</span>
                    <span className="block text-2xl font-black text-white mt-0.5">{stats.total}</span>
                  </div>
                  <MapPin className="h-8 w-8 text-blue-500/10" />
                </div>
                <div className="bg-slate-950/40 border border-slate-850 p-3 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase block">Debris Clear</span>
                    <span className="block text-2xl font-black text-red-400 mt-0.5">{stats.hasDebris}</span>
                  </div>
                  <Trash2 className="h-8 w-8 text-red-500/10" />
                </div>
              </div>

              {/* Warnings card if any duplicates exist */}
              {stats.duplicates > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-center space-x-2 text-amber-300 text-xs">
                  <AlertOctagon className="h-4.5 w-4.5 flex-shrink-0 text-amber-400 animate-pulse" />
                  <span>Found <strong>{stats.duplicates}</strong> potential duplicate submissions.</span>
                </div>
              )}

              {/* Damage level breakdown progress bars */}
              <div className="space-y-2.5 bg-slate-950/20 p-3 rounded-xl border border-slate-850">
                <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Damage Breakdown</span>
                
                <div className="space-y-2">
                  {/* Complete */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Completely Damaged</span>
                      <span className="text-red-400 font-bold">{stats.complete} ({stats.total ? Math.round(stats.complete/stats.total*100) : 0}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="bg-red-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.total ? (stats.complete/stats.total*100) : 0}%` }}></div>
                    </div>
                  </div>

                  {/* Partial */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Partially Damaged</span>
                      <span className="text-yellow-400 font-bold">{stats.partial} ({stats.total ? Math.round(stats.partial/stats.total*100) : 0}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="bg-yellow-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.total ? (stats.partial/stats.total*100) : 0}%` }}></div>
                    </div>
                  </div>

                  {/* Minimal */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Minimal / No Damage</span>
                      <span className="text-emerald-400 font-bold">{stats.minimal} ({stats.total ? Math.round(stats.minimal/stats.total*100) : 0}%)</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${stats.total ? (stats.minimal/stats.total*100) : 0}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Infrastructure Breakdown list */}
              <div className="space-y-2 bg-slate-950/20 p-3 rounded-xl border border-slate-850">
                <span className="text-[10px] text-slate-500 font-bold uppercase block mb-2">Infrastructure Assets</span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {Object.keys(stats.infraCounts).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-4 text-center space-y-1">
                      <AlertOctagon className="h-5 w-5 text-slate-600" />
                      <span className="text-xs text-slate-500 italic">No reports matching filters</span>
                    </div>
                  ) : (
                    Object.entries(stats.infraCounts).map(([type, count]) => (
                      <div key={type} className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 truncate pr-2">{type}</span>
                        <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded">{count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Data Exports */}
        <div className="p-4 border-t border-slate-800 grid grid-cols-2 gap-2 bg-slate-950/30">
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center justify-center space-x-1.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-200 border border-slate-750 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-blue-400" />
            <span>Export CSV</span>
          </button>
          
          <button
            onClick={() => handleExport('geojson')}
            className="flex items-center justify-center space-x-1.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-xl text-slate-200 border border-slate-750 transition-colors"
          >
            <Layers className="h-3.5 w-3.5 text-emerald-400" />
            <span>GeoJSON</span>
          </button>
        </div>

      </aside>

      {/* RIGHT PANEL: Map Dashboard */}
      <section className="flex-1 h-[50vh] md:h-screen w-full relative z-0">
        
        <MapContainer
          center={[13.0827, 80.2707]} // Chennai center
          zoom={12}
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {/* Custom Marker clustering logic */}
          <MarkerCluster
            reports={filteredReports}
            selectedReport={selectedReport}
            setSelectedReport={setSelectedReport}
          />
        </MapContainer>

        {/* Floating Map Legend */}
        <div className="absolute bottom-6 left-6 z-[1000] bg-slate-950/75 backdrop-blur-md border border-slate-800/80 p-4 rounded-2xl shadow-2xl text-xs space-y-2 pointer-events-auto min-w-[180px]">
          <div className="font-extrabold text-slate-400 tracking-wider uppercase text-[9px] mb-1">Damage Severity</div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
            <span className="text-slate-200 font-medium">Minimal / No Damage</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"></span>
            <span className="text-slate-200 font-medium">Partially Damaged</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
            <span className="text-slate-200 font-medium">Completely Damaged</span>
          </div>
          <div className="border-t border-slate-800/80 my-1.5 pt-1.5 flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full border border-dashed border-slate-400 inline-block bg-slate-900/50"></span>
            <span className="text-slate-400 text-[9px]">Duplicate Report</span>
          </div>
        </div>

        {/* Top float banner indicating filtered items */}
        <div className="absolute top-6 right-6 z-[400] bg-slate-950/75 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-800/80 text-xs flex items-center space-x-2.5 shadow-2xl">
          <MapPin className="h-4 w-4 text-blue-400 animate-pulse" />
          <span className="text-slate-200 font-semibold">Showing <strong className="text-blue-400 font-extrabold">{filteredReports.length}</strong> location pins</span>
        </div>

      </section>

      {/* Selected Report Details Panel */}
      {selectedReport && (
        <div className="absolute top-4 right-4 bottom-4 w-80 lg:w-96 z-[1000] bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-in pointer-events-auto">
          {/* Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <div className="flex items-center space-x-2">
              <MapPin className="h-4.5 w-4.5 text-blue-500" />
              <h3 className="font-bold text-sm text-white">Report Detail</h3>
            </div>
            <button 
              onClick={() => setSelectedReport(null)}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="h-5 w-5 rotate-180" />
            </button>
          </div>
          
          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Photo */}
            {selectedReport.photo_url ? (
              <div className="relative h-44 w-full overflow-hidden rounded-xl bg-slate-950 border border-slate-800">
                <img src={selectedReport.photo_url} className="w-full h-full object-cover" alt="Damage" />
              </div>
            ) : (
              <div className="h-32 bg-slate-950 rounded-xl flex flex-col items-center justify-center border border-slate-850 text-xs text-slate-500">
                <span>No photo available</span>
              </div>
            )}
            
            {/* Severity Badges & Dates */}
            <div className="flex justify-between items-center">
              <span className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider border ${
                selectedReport.damage_level === 'Completely damaged' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                selectedReport.damage_level === 'Partially damaged' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              }`}>
                {selectedReport.damage_level}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {new Date(selectedReport.submitted_at).toLocaleString()}
              </span>
            </div>

            {/* Infrastructure & Crisis details */}
            <div className="space-y-3 bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl text-xs">
              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px]">Infrastructure Name</span>
                <span className="text-slate-200 font-semibold">{selectedReport.infrastructure_details || 'Unnamed Structure'}</span>
              </div>
              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px]">Infrastructure Category</span>
                <span className="text-slate-200">{selectedReport.infrastructure_type?.join(', ')}</span>
              </div>
              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px]">Nature of Crisis</span>
                <span className="text-slate-200">{selectedReport.crisis_type?.join(', ')}</span>
              </div>
              <div>
                <span className="text-slate-500 block uppercase font-bold text-[9px]">Debris Blocking</span>
                <span className={selectedReport.has_debris ? 'text-red-400 font-semibold' : 'text-slate-300'}>
                  {selectedReport.has_debris ? 'Yes - Needs Clearance' : 'No'}
                </span>
              </div>
              {selectedReport.landmark_description && (
                <div>
                  <span className="text-slate-500 block uppercase font-bold text-[9px]">Nearby Landmark</span>
                  <span className="text-slate-300">{selectedReport.landmark_description}</span>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1">
              <span className="text-slate-500 block uppercase font-bold text-[9px]">Report Description</span>
              <p className="text-xs text-slate-200 leading-relaxed bg-slate-950/20 border border-slate-850/60 p-3 rounded-xl">
                {selectedReport.description_translated || selectedReport.description || 'No description provided.'}
                {selectedReport.language !== 'en' && selectedReport.description_translated && (
                  <span className="block mt-2 text-[9px] text-slate-500 italic">
                    (Translated from {selectedReport.language.toUpperCase()}: "{selectedReport.description}")
                  </span>
                )}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button 
                onClick={() => setSelectedReport(null)}
                className="w-full h-12 rounded-xl bg-slate-900 border border-slate-800 text-white font-bold hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => handleDeleteReport(selectedReport.id)}
                className="w-full h-12 rounded-xl bg-emerald-600/20 text-emerald-400 font-bold border border-emerald-500/30 hover:bg-emerald-600/30 transition-colors flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="h-5 w-5" />
                <span>Resolve & Remove</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toggle Sidebar Button */}
      <button 
        onClick={() => {
          setIsSidebarOpen(!isSidebarOpen);
          triggerToast(isSidebarOpen ? "Control panel hidden" : "Control panel visible");
        }}
        className="absolute top-[80px] left-[10px] z-[1000] p-2.5 bg-slate-900/95 border border-slate-800 rounded-lg text-slate-300 hover:text-white shadow-lg pointer-events-auto flex items-center justify-center transition-all hover:scale-105"
        title={isSidebarOpen ? "Hide Controls" : "Show Controls"}
      >
        <LayoutDashboard className="h-4.5 w-4.5" />
      </button>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] bg-slate-900/95 border border-slate-800 text-slate-100 px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 animate-fade-in">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
          <span className="text-xs font-semibold">{toast}</span>
        </div>
      )}

    </div>
  );
}
