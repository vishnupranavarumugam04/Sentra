import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  Camera, MapPin, Globe, Check, AlertTriangle, CloudOff, 
  Sparkles, CheckCircle2, ChevronRight, RefreshCw, LogIn, ChevronLeft
} from 'lucide-react';
import { saveReportOffline, getOfflineCount } from '../utils/indexedDb';

// Leaflet default icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Interactive map click component
function MapEventsHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

// Map recentering component
function RecenterMap({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 15);
    }
  }, [position, map]);
  return null;
}

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '中文' },
  { code: 'ar', name: 'العربية' }
];

// Native canvas-based client-side image compression helper
const compressImage = (file, maxWidth = 1024, maxHeight = 1024, quality = 0.7) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          const name = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
          const compressedFile = new File([blob], name, {
            type: 'image/jpeg',
            lastModified: Date.now()
          });
          resolve(compressedFile);
        }, 'image/jpeg', quality);
      };
    };
  });
};

export default function PublicForm({ onNavigateToLogin, onNavigateToAdmin }) {
  const { t, i18n } = useTranslation();
  
  // Step Wizard State
  const [step, setStep] = useState(1); // Steps: 1 (Photo), 2 (Details), 3 (Location), 4 (Desc & Lang), 5 (Review)

  // Form State
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [damageLevel, setDamageLevel] = useState('');
  const [selectedInfra, setSelectedInfra] = useState([]);
  const [infraDetails, setInfraDetails] = useState('');
  const [selectedCrisis, setSelectedCrisis] = useState([]);
  const [hasDebris, setHasDebris] = useState(false);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(null); // { lat, lng }
  const [landmarkDesc, setLandmarkDesc] = useState('');
  
  // UI & Network State
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [nearbyCount, setNearbyCount] = useState(0);
  const [offlineCount, setOfflineCount] = useState(0);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsErrorMsg, setGpsErrorMsg] = useState('');
  const [gpsSuccessMsg, setGpsSuccessMsg] = useState('');
  const [userReports, setUserReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [showEmergencySent, setShowEmergencySent] = useState(false);
  const [emergencySending, setEmergencySending] = useState(false);
  
  const fileInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const globalCameraInputRef = useRef(null);
  const [mode, setMode] = useState('map'); // 'map' | 'camera' | 'form' | 'history'

  // Sync state & update online status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerManualSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check of offline queue
    updateOfflineQueueCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.removeItem('sentra_user_reports');
      const savedReports = localStorage.getItem('sentra_user_reports_v2');
      if (savedReports) {
        setUserReports(JSON.parse(savedReports));
      }
    } catch (error) {
      console.warn('Failed to load user reports from storage:', error);
    }
  }, []);

  const persistUserReports = (nextReports) => {
    setUserReports(nextReports);
    localStorage.setItem('sentra_user_reports_v2', JSON.stringify(nextReports));
  };

  const openReportDetails = (report) => {
    setSelectedReport(report);
  };

  const closeReportDetails = () => {
    setSelectedReport(null);
  };

  const sendEmergencyAlert = async () => {
    try {
      setEmergencySending(true);

      const position = location
        ? { latitude: location.lat, longitude: location.lng }
        : null;

      const response = await fetch('/api/emergency-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_type: 'SOS',
          message: 'Emergency SOS alert from user.',
          latitude: position?.latitude ?? null,
          longitude: position?.longitude ?? null,
          metadata: {
            source: 'user-ui',
            has_location: Boolean(position),
            language: i18n.language || 'en'
          }
        })
      });

      if (!response.ok) {
        throw new Error('Emergency alert failed');
      }

      setShowEmergencySent(true);
    } catch (error) {
      console.error('Failed to send emergency alert:', error);
      alert('Emergency alert could not be sent right now. Please try again.');
    } finally {
      setEmergencySending(false);
    }
  };

  useEffect(() => {
    const startCamera = async () => {
      if (mode !== 'camera') return;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not supported on this device.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }
          },
          audio: false
        });

        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          await cameraVideoRef.current.play();
        }
      } catch (error) {
        console.warn('Failed to start camera preview:', error);
      }
    };

    const stopCamera = () => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach((track) => track.stop());
        cameraStreamRef.current = null;
      }
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = null;
      }
    };

    if (mode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [mode]);

  const updateOfflineQueueCount = async () => {
    try {
      const count = await getOfflineCount();
      setOfflineCount(count);
    } catch (e) {
      console.warn('Could not read offline queue count', e);
    }
  };

  const triggerManualSync = async () => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
      const registration = await navigator.serviceWorker.ready;
      try {
        await registration.sync.register('sync-reports');
        console.log('[Form] Registered sync-reports sync event');
      } catch (err) {
        if (registration.active) {
          registration.active.postMessage({ type: 'TRIGGER_SYNC' });
        }
      }
    }
  };

  // Listen to BroadcastChannel for sync completion
  useEffect(() => {
    const channel = new BroadcastChannel('sentra_sync_channel');
    channel.onmessage = (event) => {
      if (event.data && event.data.type === 'SYNC_COMPLETE') {
        console.log(`[Form] Sync completed in background, ${event.data.count} items synced.`);
        updateOfflineQueueCount();
      }
    };
    return () => channel.close();
  }, []);

  // Infrastructure lists
  const INFRA_OPTIONS = [
    { key: 'Residential', label: 'Residential' },
    { key: 'Commercial', label: 'Commercial' },
    { key: 'Government', label: 'Government' },
    { key: 'Utility', label: 'Utility' },
    { key: 'Transport & Communication', label: 'Transport & Communication' },
    { key: 'Community', label: 'Community' },
    { key: 'Public Spaces/Recreation', label: 'Public Spaces/Recreation' },
    { key: 'Other', label: 'Other' }
  ];

  const CRISIS_OPTIONS = [
    { key: 'Earthquake', label: 'Earthquake' },
    { key: 'Flood', label: 'Flood' },
    { key: 'Tsunami', label: 'Tsunami' },
    { key: 'Hurricane/Cyclone', label: 'Hurricane/Cyclone' },
    { key: 'Wildfire', label: 'Wildfire' },
    { key: 'Explosion', label: 'Explosion' },
    { key: 'Chemical incident', label: 'Chemical incident' },
    { key: 'Conflict', label: 'Conflict' },
    { key: 'Civil unrest', label: 'Civil unrest' }
  ];

  // Language switch handler
  const handleLanguageChange = (langCode) => {
    i18n.changeLanguage(langCode);
    document.documentElement.dir = langCode === 'ar' ? 'rtl' : 'ltr';
  };

  // Photo handlers
  const handlePhotoSelect = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        const compressedFile = await compressImage(file);
        setPhoto(compressedFile);
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotoPreview(reader.result);
          setMode('form');
        };
        reader.readAsDataURL(compressedFile);
      } catch (err) {
        console.warn('Image compression failed, using original:', err);
        setPhoto(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotoPreview(reader.result);
          setMode('form');
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleGallerySelect = (e) => {
    handlePhotoSelect(e);
  };

  const captureCameraPhoto = () => {
    const video = cameraVideoRef.current;
    if (!video || video.readyState < 2) {
      alert(t('camera_not_ready', 'Camera is still starting. Please wait a moment and try again.'));
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;

      const file = new File([blob], `sentra-camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const syntheticEvent = { target: { files: [file] } };
      handlePhotoSelect(syntheticEvent);
    }, 'image/jpeg', 0.92);
  };

  // Multi-select toggle helper
  const toggleSelection = (list, setList, val) => {
    if (list.includes(val)) {
      setList(list.filter(item => item !== val));
    } else {
      setList([...list, val]);
    }
  };

  // Geolocation trigger
  const captureGPS = () => {
    setGpsLoading(true);
    setGpsErrorMsg('');
    setGpsSuccessMsg('');
    
    if (!navigator.geolocation) {
      setGpsErrorMsg(t('gps_error', 'Geolocation is not supported by your browser.'));
      setGpsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocation({ lat: latitude, lng: longitude });
        setGpsSuccessMsg(t('gps_success'));
        setGpsLoading(false);
      },
      (error) => {
        console.warn('Geolocation error:', error);
        setGpsErrorMsg(t('gps_error'));
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  // Form submit handler
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    
    // Validations
    if (!damageLevel) {
      alert(t('alert_select_damage', 'Please select a damage classification.'));
      setStep(2);
      return;
    }
    if (selectedInfra.length === 0) {
      alert(t('alert_select_infra', 'Please select at least one infrastructure type.'));
      setStep(2);
      return;
    }
    if (selectedCrisis.length === 0) {
      alert(t('alert_select_crisis', 'Please select at least one nature of crisis.'));
      setStep(2);
      return;
    }

    // Coordinates fallback
    let submitLat = location?.lat;
    let submitLng = location?.lng;

    if (!submitLat || !submitLng) {
      if (!landmarkDesc.trim()) {
        alert(t('alert_location_required', 'Please drop a pin on the map, click capture GPS, or describe the location using a nearby landmark.'));
        setStep(3);
        return;
      }
      // Use fallback center coordinates (Chennai) for PostGIS NOT NULL requirements
      submitLat = CHENNAI_LAT;
      submitLng = CHENNAI_LNG;
    }

    const payload = {
      damage_level: damageLevel,
      infrastructure_type: selectedInfra,
      infrastructure_details: infraDetails,
      crisis_type: selectedCrisis,
      has_debris: hasDebris,
      description,
      latitude: submitLat,
      longitude: submitLng,
      landmark_description: landmarkDesc,
      language: i18n.language || 'en'
    };

    const reportRecord = {
      id: `${Date.now()}`,
      photo: photoPreview,
      damage_level: damageLevel,
      infrastructure_type: selectedInfra,
      infrastructure_details: infraDetails,
      crisis_type: selectedCrisis,
      has_debris: hasDebris,
      description,
      latitude: submitLat,
      longitude: submitLng,
      landmark_description: landmarkDesc,
      submitted_at: new Date().toISOString(),
      syncStatus: isOnline ? 'SYNCED' : 'PENDING SYNC'
    };

    setLoading(true);

    if (isOnline) {
      try {
        const formData = new FormData();
        Object.keys(payload).forEach(key => {
          if (Array.isArray(payload[key])) {
            formData.append(key, JSON.stringify(payload[key]));
          } else {
            formData.append(key, payload[key]);
          }
        });

        if (photo) {
          formData.append('photo', photo);
        }

        const response = await fetch('/api/reports', {
          method: 'POST',
          body: formData
        });

        if (response.ok) {
          const data = await response.json();
          setNearbyCount(data.nearby_count || 1);
          persistUserReports([reportRecord, ...userReports]);
          setShowSuccess(true);
          resetForm();
        } else {
          const errData = await response.json();
          throw new Error(errData.error || 'Upload failed');
        }
      } catch (err) {
        console.warn('Online submit failed, saving to offline store as fallback:', err);
        await saveOffline(payload);
      } finally {
        setLoading(false);
      }
    } else {
      await saveOffline(payload);
      setLoading(false);
    }
  };

  const saveOffline = async (payload) => {
    try {
      await saveReportOffline(payload, photo);
      persistUserReports([
        {
          id: `${Date.now()}`,
          photo: photoPreview,
          damage_level: payload.damage_level,
          infrastructure_type: payload.infrastructure_type,
          infrastructure_details: payload.infrastructure_details,
          crisis_type: payload.crisis_type,
          has_debris: payload.has_debris,
          description: payload.description,
          latitude: payload.latitude,
          longitude: payload.longitude,
          landmark_description: payload.landmark_description,
          submitted_at: new Date().toISOString(),
          syncStatus: 'PENDING SYNC'
        },
        ...userReports
      ]);
      await updateOfflineQueueCount();
      alert(t('submit_offline'));
      resetForm();
      setNearbyCount(0); 
      setShowSuccess(true);
    } catch (err) {
      console.error('Failed to save report offline:', err);
      alert('Error saving report offline. Please try again.');
    }
  };

  const resetForm = () => {
    setPhoto(null);
    setPhotoPreview('');
    setDamageLevel('');
    setSelectedInfra([]);
    setInfraDetails('');
    setSelectedCrisis([]);
    setHasDebris(false);
    setDescription('');
    setLocation(null);
    setLandmarkDesc('');
    setStep(1);
  };

  // Step Indicators Layout
  const renderProgress = () => {
    const stepsList = [
      { num: 1, label: t('step_photo', 'Photo') },
      { num: 2, label: t('step_details', 'Details') },
      { num: 3, label: t('step_location', 'Location') },
      { num: 4, label: t('step_desc', 'Description') },
      { num: 5, label: t('step_review', 'Review') }
    ];
    
    return (
      <div className="w-full bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-slate-400 font-bold uppercase">
            {t('step_indicator', 'Step')} {step} / 5
          </span>
          <span className="text-xs text-blue-400 font-extrabold uppercase">
            {stepsList[step - 1].label}
          </span>
        </div>
        <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden flex">
          {stepsList.map((s) => (
            <div 
              key={s.num} 
              className={`flex-1 h-full border-r border-slate-950/20 last:border-0 transition-colors duration-300 ${
                s.num <= step ? 'bg-blue-600' : 'bg-slate-800'
              }`}
            ></div>
          ))}
        </div>
      </div>
    );
  };

  // Step 1: Photo Component
  const renderStep1 = () => (
    <div className="space-y-4">
      <div className="text-center py-2">
        <h3 className="text-lg font-bold text-white">{t('step_photo_title', 'Capture Photo of Damage')}</h3>
        <p className="text-xs text-slate-400 mt-1">
          {t('step_photo_subtitle', 'Snapping a clear photo helps responder teams assess severity and tools required.')}
        </p>
      </div>

      {photoPreview ? (
        <div className="space-y-3">
          <div className="relative rounded-2xl overflow-hidden border border-slate-800 bg-slate-955">
            <img 
              src={photoPreview} 
              alt="Preview" 
              className="w-full h-64 object-cover object-center"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setPhoto(null);
              setPhotoPreview('');
            }}
            className="w-full h-12 bg-red-900/35 border border-red-500/30 hover:bg-red-900/50 text-red-300 font-bold rounded-xl flex items-center justify-center space-x-2 transition-colors min-h-[44px]"
          >
            <Camera className="h-4.5 w-4.5" />
            <span>{t('photo_change', 'Change Photo')}</span>
          </button>
        </div>
      ) : (
        <div 
          onClick={() => fileInputRef.current.click()}
          className="border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-900/40 rounded-2xl p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center space-y-4 min-h-[220px]"
        >
          <div className="h-14 w-14 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
            <Camera className="h-7 w-7" />
          </div>
          <div>
            <p className="text-slate-200 font-bold text-sm">{t('photo_tap_instruction', 'Tap to snap photo using camera')}</p>
            <p className="text-slate-500 text-xs mt-1.5">{t('photo_browse_instruction', 'or browse device file picker')}</p>
          </div>
        </div>
      )}
      
      <input 
        type="file" 
        accept="image/*" 
        capture="environment"
        ref={fileInputRef} 
        onChange={handlePhotoSelect} 
        className="hidden"
      />

      <div className="pt-4 border-t border-slate-800 flex justify-end">
        <button
          type="button"
          onClick={() => setStep(2)}
          disabled={!photo}
          className="h-12 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center space-x-2 min-h-[44px]"
        >
          <span>{t('next_button', 'Next')}</span>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  // Step 2: Damage Details Component
  const renderStep2 = () => (
    <div className="space-y-5">
      <div className="text-center py-1">
        <h3 className="text-lg font-bold text-white">{t('step_details_title', 'Damage Details')}</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {t('step_details_subtitle', 'Classify severity level and select affected structures.')}
        </p>
      </div>

      {/* Damage Classification Cards */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">{t('damage_level')}</label>
        <div className="space-y-2">
          {/* Minimal */}
          <button
            type="button"
            onClick={() => setDamageLevel('Minimal/No damage')}
            className={`w-full p-4 rounded-xl border text-left flex items-center justify-between transition-all min-h-[60px] ${
              damageLevel === 'Minimal/No damage'
                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-750'
            }`}
          >
            <span className="text-sm">{t('damage_minimal')}</span>
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500"></span>
          </button>

          {/* Partial */}
          <button
            type="button"
            onClick={() => setDamageLevel('Partially damaged')}
            className={`w-full p-4 rounded-xl border text-left flex items-center justify-between transition-all min-h-[60px] ${
              damageLevel === 'Partially damaged'
                ? 'bg-yellow-500/15 border-yellow-500 text-yellow-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-750'
            }`}
          >
            <span className="text-sm">{t('damage_partial')}</span>
            <span className="w-3.5 h-3.5 rounded-full bg-yellow-500"></span>
          </button>

          {/* Complete */}
          <button
            type="button"
            onClick={() => setDamageLevel('Completely damaged')}
            className={`w-full p-4 rounded-xl border text-left flex items-center justify-between transition-all min-h-[60px] ${
              damageLevel === 'Completely damaged'
                ? 'bg-red-500/15 border-red-500 text-red-300 font-bold'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-750'
            }`}
          >
            <span className="text-sm">{t('damage_complete')}</span>
            <span className="w-3.5 h-3.5 rounded-full bg-red-500"></span>
          </button>
        </div>
      </div>

      {/* Infrastructure Type Chips */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">
          {t('infra_type')} <span className="text-[10px] text-slate-500 lowercase">({t('select_multiple', 'select multiple')})</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {INFRA_OPTIONS.map(opt => {
            const isSelected = selectedInfra.includes(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => toggleSelection(selectedInfra, setSelectedInfra, opt.key)}
                className={`px-4 py-2.5 rounded-full border text-xs font-bold transition-all min-h-[44px] ${
                  isSelected 
                    ? 'bg-blue-600 border-blue-500 text-white' 
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                {t(opt.key)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Infrastructure Details */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">{t('infra_details')}</label>
        <input 
          type="text"
          value={infraDetails}
          onChange={(e) => setInfraDetails(e.target.value)}
          placeholder={t('infra_placeholder')}
          className="w-full h-12 px-4 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Nature of Crisis Chips */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">
          {t('crisis_type')} <span className="text-[10px] text-slate-500 lowercase">({t('select_multiple', 'select multiple')})</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {CRISIS_OPTIONS.map(opt => {
            const isSelected = selectedCrisis.includes(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => toggleSelection(selectedCrisis, setSelectedCrisis, opt.key)}
                className={`px-4 py-2.5 rounded-full border text-xs font-bold transition-all min-h-[44px] ${
                  isSelected 
                    ? 'bg-blue-600 border-blue-500 text-white' 
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                {t(opt.key)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Debris Switch */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">{t('debris_clearing')}</label>
        <div className="flex space-x-2 bg-slate-950 p-1 rounded-xl border border-slate-850">
          <button
            type="button"
            onClick={() => setHasDebris(true)}
            className={`flex-1 h-11 text-center text-xs font-bold rounded-lg transition-colors min-h-[44px] ${
              hasDebris ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('debris_yes')}
          </button>
          <button
            type="button"
            onClick={() => setHasDebris(false)}
            className={`flex-1 h-11 text-center text-xs font-bold rounded-lg transition-colors min-h-[44px] ${
              !hasDebris ? 'bg-slate-800 text-slate-200' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t('debris_no')}
          </button>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-800 flex justify-between">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="h-12 px-6 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 font-bold rounded-xl min-h-[44px]"
        >
          {t('back_button', 'Back')}
        </button>
        <button
          type="button"
          onClick={() => setStep(3)}
          disabled={!damageLevel || selectedInfra.length === 0 || selectedCrisis.length === 0}
          className="h-12 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center space-x-2 min-h-[44px]"
        >
          <span>{t('next_button', 'Next')}</span>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  // Step 3: Location Component
  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="text-center py-1">
        <h3 className="text-lg font-bold text-white">{t('step_location_title', 'Pinpoint Location')}</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {t('step_location_subtitle', 'Drop a pin manually or use GPS geolocation to tag coordinates.')}
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={captureGPS}
          disabled={gpsLoading}
          className="w-full h-12 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800/40 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center space-x-2 shadow-md min-h-[44px]"
        >
          <MapPin className="h-5 w-5" />
          <span>{gpsLoading ? 'Locating...' : t('gps_button')}</span>
        </button>

        {gpsSuccessMsg && (
          <div className="text-xs text-emerald-400 font-semibold flex items-center space-x-1.5 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg">
            <Check className="h-4 w-4" />
            <span>{gpsSuccessMsg}</span>
          </div>
        )}

        {gpsErrorMsg && (
          <div className="text-xs text-amber-400 font-semibold flex items-center space-x-1.5 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
            <AlertTriangle className="h-4 w-4" />
            <span>{gpsErrorMsg}</span>
          </div>
        )}
      </div>

      {/* Leaflet Map */}
      <div className="h-64 rounded-2xl overflow-hidden border border-slate-800 relative z-0">
        <MapContainer 
          center={[CHENNAI_LAT, CHENNAI_LNG]} 
          zoom={12} 
          scrollWheelZoom={true}
          style={{ height: '100%', width: '100%' }}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEventsHandler onMapClick={(lat, lng) => setLocation({ lat, lng })} />
          {location && <RecenterMap position={[location.lat, location.lng]} />}
          {location && (
            <Marker position={[location.lat, location.lng]} />
          )}
        </MapContainer>
      </div>
      <p className="text-[10px] text-slate-500">
        {t('map_manual_instruction', 'Tap anywhere on the map above to manually drop a pin at the location of damage.')}
      </p>

      {/* Landmark Fallback */}
      {(!location) && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
          <div className="flex items-start space-x-2 text-amber-400">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <span className="text-xs font-semibold">{t('landmark_info')}</span>
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-slate-400 mb-1">{t('landmark_fallback')}</label>
            <input 
              type="text"
              value={landmarkDesc}
              onChange={(e) => setLandmarkDesc(e.target.value)}
              required={!location}
              placeholder={t('landmark_placeholder')}
              className="w-full h-12 px-4 bg-slate-900 border border-slate-700 rounded-xl text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      )}

      {location && (
        <div className="space-y-1">
          <label className="block text-xs font-bold uppercase text-slate-500">{t('landmark_optional', 'Nearby Landmark (Optional)')}</label>
          <input 
            type="text"
            value={landmarkDesc}
            onChange={(e) => setLandmarkDesc(e.target.value)}
            placeholder={t('landmark_placeholder')}
            className="w-full h-12 px-4 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
      )}

      <div className="pt-4 border-t border-slate-800 flex justify-between">
        <button
          type="button"
          onClick={() => setStep(2)}
          className="h-12 px-6 bg-slate-900 hover:bg-slate-855 text-slate-300 border border-slate-800 font-bold rounded-xl min-h-[44px]"
        >
          {t('back_button', 'Back')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (!location && !landmarkDesc.trim()) {
              alert(t('alert_location_required', 'Please pinpoint a location on the map or describe a nearby landmark.'));
              return;
            }
            setStep(4);
          }}
          className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center space-x-2 min-h-[44px]"
        >
          <span>{t('next_button', 'Next')}</span>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  // Step 4: Description & Language Component
  const renderStep4 = () => (
    <div className="space-y-5">
      <div className="text-center py-1">
        <h3 className="text-lg font-bold text-white">{t('step_desc_title', 'Description & Language')}</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {t('step_desc_subtitle', 'Choose your preferred language and write a short summary of the situation.')}
        </p>
      </div>

      {/* Language Selector Grid */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">{t('preferred_language', 'Preferred Language')}</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleLanguageChange(lang.code)}
              className={`h-12 font-bold text-xs rounded-xl transition-all border min-h-[44px] ${
                i18n.language.startsWith(lang.code)
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-750'
              }`}
            >
              {lang.name} ({lang.code.toUpperCase()})
            </button>
          ))}
        </div>
      </div>

      {/* Description Field */}
      <div className="space-y-2">
        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider">{t('description')}</label>
        <textarea
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('description_placeholder')}
          className="w-full p-4 bg-slate-900 border border-slate-800 rounded-xl text-white text-sm outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="pt-4 border-t border-slate-800 flex justify-between">
        <button
          type="button"
          onClick={() => setStep(3)}
          className="h-12 px-6 bg-slate-900 hover:bg-slate-855 text-slate-300 border border-slate-800 font-bold rounded-xl min-h-[44px]"
        >
          {t('back_button', 'Back')}
        </button>
        <button
          type="button"
          onClick={() => setStep(5)}
          className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center space-x-2 min-h-[44px]"
        >
          <span>{t('next_button', 'Review')}</span>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  // Step 5: Review & Submit Component
  const renderStep5 = () => (
    <div className="space-y-6">
      <div className="text-center py-1">
        <h3 className="text-lg font-bold text-white">{t('step_review_title', 'Review & Submit')}</h3>
        <p className="text-xs text-slate-400 mt-0.5">
          {t('step_review_subtitle', 'Verify all information before final submission.')}
        </p>
      </div>

      {/* Photo Summary */}
      <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase text-slate-400">{t('step_photo', 'Photo')}</span>
          <button 
            type="button" 
            onClick={() => setStep(1)} 
            className="text-xs text-blue-400 font-bold hover:underline"
          >
            {t('edit_button', 'Edit')}
          </button>
        </div>
        {photoPreview ? (
          <img src={photoPreview} className="w-full h-40 object-cover rounded-xl border border-slate-800" alt="Preview" />
        ) : (
          <div className="h-20 bg-slate-950 rounded-xl flex items-center justify-center text-xs text-slate-500 border border-slate-800">
            {t('no_photo', 'No Photo Selected')}
          </div>
        )}
      </div>

      {/* Details Summary */}
      <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase text-slate-400">{t('step_details', 'Details')}</span>
          <button 
            type="button" 
            onClick={() => setStep(2)} 
            className="text-xs text-blue-400 font-bold hover:underline"
          >
            {t('edit_button', 'Edit')}
          </button>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Damage Level:</span>
            <span className={`font-bold ${
              damageLevel === 'Completely damaged' ? 'text-red-400' :
              damageLevel === 'Partially damaged' ? 'text-yellow-400' :
              'text-emerald-400'
            }`}>{t(damageLevel === 'Minimal/No damage' ? 'damage_minimal' : damageLevel === 'Partially damaged' ? 'damage_partial' : 'damage_complete')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Infrastructure:</span>
            <span className="text-slate-300 font-semibold">{selectedInfra.map(i => t(i)).join(', ')}</span>
          </div>
          {infraDetails && (
            <div className="flex justify-between">
              <span className="text-slate-500">Structure Name:</span>
              <span className="text-slate-300">{infraDetails}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Nature of Crisis:</span>
            <span className="text-slate-300">{selectedCrisis.map(c => t(c)).join(', ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Debris Requiring Clearing:</span>
            <span className="text-slate-300 font-semibold">{hasDebris ? t('debris_yes') : t('debris_no')}</span>
          </div>
        </div>
      </div>

      {/* Location Summary */}
      <div className="bg-slate-900 border border-slate-855 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase text-slate-400">{t('step_location', 'Location')}</span>
          <button 
            type="button" 
            onClick={() => setStep(3)} 
            className="text-xs text-blue-400 font-bold hover:underline"
          >
            {t('edit_button', 'Edit')}
          </button>
        </div>
        
        {location ? (
          <div className="space-y-2">
            <div className="h-32 rounded-xl overflow-hidden border border-slate-800 relative z-0">
              <MapContainer 
                center={[location.lat, location.lng]} 
                zoom={14} 
                scrollWheelZoom={false}
                zoomControl={false}
                dragging={false}
                doubleClickZoom={false}
                boxZoom={false}
                style={{ height: '100%', width: '100%' }}
                className="h-full w-full pointer-events-none"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[location.lat, location.lng]} />
              </MapContainer>
            </div>
            <div className="text-[11px] text-slate-400 font-mono text-center">
              Coordinates: {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-amber-300 flex items-center space-x-2">
            <AlertTriangle className="h-4.5 w-4.5 text-amber-400" />
            <span>Using landmark: "{landmarkDesc}"</span>
          </div>
        )}
      </div>

      {/* Description Summary */}
      <div className="bg-slate-900 border border-slate-855 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase text-slate-400">{t('description')}</span>
          <button 
            type="button" 
            onClick={() => setStep(4)} 
            className="text-xs text-blue-400 font-bold hover:underline"
          >
            {t('edit_button', 'Edit')}
          </button>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed bg-slate-955 p-3 rounded-xl border border-slate-800/80">
          {description || t('no_description', 'No description provided.')}
        </p>
      </div>

      <div className="pt-4 border-t border-slate-800 flex justify-between">
        <button
          type="button"
          onClick={() => setStep(4)}
          className="h-12 px-6 bg-slate-900 hover:bg-slate-855 text-slate-300 border border-slate-800 font-bold rounded-xl min-h-[44px]"
        >
          {t('back_button', 'Back')}
        </button>
        <button
          type="submit"
          disabled={loading}
          className={`h-12 px-8 rounded-xl font-bold flex items-center justify-center space-x-2 text-white shadow-lg transition-all active:scale-95 min-h-[44px] ${
            isOnline 
              ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20' 
              : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span>{loading ? 'Processing...' : (isOnline ? t('submit_button') : t('submit_offline'))}</span>
          <CheckCircle2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );

  if (showSuccess) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center px-4 py-12 bg-slate-950 text-white relative">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 relative z-10">
          <div className="mx-auto w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="h-10 w-10 animate-bounce" />
          </div>
          
          <h2 className="text-3xl font-extrabold tracking-tight">{t('success_thank_you')}</h2>
          
          <p className="text-slate-300 text-base leading-relaxed">
            {nearbyCount > 0 ? (
              <>
                <span className="font-extrabold text-2xl text-emerald-400 block my-2">{nearbyCount}</span>
                {t('success_engagement')}
              </>
            ) : (
              "Your report was queued locally. It will upload automatically in the background when connection returns."
            )}
          </p>
          
          <div className="pt-6">
            <button
              onClick={() => setShowSuccess(false)}
              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 min-h-[44px]"
            >
              {t('success_done')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-950 pb-12 relative min-h-screen">

      {/* Top Navigation Bar (user style from reference) */}
      <header className="sticky top-0 z-50 bg-black px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-full bg-white/6 flex items-center justify-center text-white font-black text-lg">S</div>
          <div>
            <h1 className="font-extrabold text-lg text-white tracking-tight leading-none">{t('app_title')}</h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onNavigateToAdmin}
            className="px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs font-semibold text-white hover:bg-white/15"
          >
            Admin Portal
          </button>
          <div className="flex items-center space-x-2 bg-white/6 px-3 py-1 rounded-full">
            <Globe className="h-3.5 w-3.5 text-white/80" />
            <span className="text-xs text-white/90 font-semibold">{t('app_title')}</span>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-800 text-xs text-slate-200 flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
            <span className="font-semibold">GPS ACTIVE</span>
          </div>
        </div>
      </header>

      {/* Small status bar area for user view */}
      <div className="max-w-3xl w-full mx-auto px-4 mt-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-600 font-medium">{offlineCount} Pending • {isOnline ? 'Online' : 'Offline'}</div>
          <div className="text-xs text-slate-600">Nearest Hub • 2km</div>
        </div>
      </div>

      {/* Main area: switch between map, camera, history, and form sheet */}
      <div className="mt-4">
        {mode === 'map' && (
          <div className="relative h-[70vh]">
            <MapContainer center={[CHENNAI_LAT, CHENNAI_LNG]} zoom={12} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {userReports
                .filter((report) => report.latitude && report.longitude)
                .map((report) => (
                  <Marker
                    key={report.id}
                    position={[report.latitude, report.longitude]}
                    eventHandlers={{ click: () => openReportDetails(report) }}
                  />
                ))}
              {location && <Marker position={[location.lat, location.lng]} />}
            </MapContainer>

            <div className="absolute left-1/2 -translate-x-1/2 bottom-8 z-50">
              <button onClick={() => setMode('form')} className="bg-blue-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center space-x-3">
                <Camera className="h-5 w-5" />
                <span className="font-bold">Start New Damage Report</span>
              </button>
            </div>

            <button
              onClick={sendEmergencyAlert}
              disabled={emergencySending}
              className="fixed right-6 bottom-24 h-14 w-14 rounded-full bg-red-600 z-[3000] flex items-center justify-center text-white shadow-2xl border-4 border-white/10 disabled:opacity-70"
              aria-label="Emergency SOS"
            >
              <AlertTriangle className={`h-5 w-5 ${emergencySending ? 'animate-pulse' : ''}`} />
            </button>
          </div>
        )}

        {mode === 'camera' && (
          <div className="relative h-[70vh] bg-black overflow-hidden">
            <video
              ref={cameraVideoRef}
              className="absolute inset-0 h-full w-full object-cover"
              playsInline
              muted
              autoPlay
            />

            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/35 pointer-events-none" />

            <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-4 text-white">
              <div className="flex items-center space-x-3">
                <button type="button" onClick={() => setMode('map')} className="h-9 w-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div>
                  <div className="text-sm font-semibold leading-none">Sentra</div>
                  <div className="text-[10px] text-white/75 uppercase tracking-[0.2em] mt-1">Camera</div>
                </div>
              </div>

              <div className="px-3 py-1 rounded-full bg-black/35 backdrop-blur-sm text-xs text-white flex items-center space-x-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
                <span className="font-semibold">GPS ACTIVE</span>
              </div>
            </header>

            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 text-white text-center px-4">
              <div className="text-base font-semibold">Tap to capture damage</div>
            </div>

            <div className="absolute bottom-6 left-0 right-0 z-30 flex items-end justify-between px-6">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="h-14 w-14 rounded-full bg-black/35 backdrop-blur-md border border-white/15 flex items-center justify-center text-white shadow-lg"
                aria-label="Upload from gallery"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="M21 15l-5-5L5 21" />
                </svg>
              </button>

              <button
                type="button"
                onClick={captureCameraPhoto}
                className="h-20 w-20 rounded-full bg-white flex items-center justify-center border-[6px] border-black/40 shadow-[0_0_0_8px_rgba(255,255,255,0.15)]"
                aria-label="Capture photo"
              >
                <div className="h-14 w-14 rounded-full bg-white border-2 border-slate-300" />
              </button>

              <button
                type="button"
                onClick={sendEmergencyAlert}
                disabled={emergencySending}
                className="h-14 w-14 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg border-4 border-white/10"
                aria-label="Emergency SOS"
              >
                <AlertTriangle className={`h-5 w-5 ${emergencySending ? 'animate-pulse' : ''}`} />
              </button>
            </div>

            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleGallerySelect}
            />
          </div>
        )}

        {mode === 'history' && (
          <div className="min-h-[70vh] bg-[#f5f7fc] p-6">
            <h2 className="text-2xl font-extrabold text-slate-900 mb-1">Report History</h2>
            <p className="text-sm text-slate-600 mb-4">Review and sync your local reports</p>
            <div className="space-y-4">
              {(userReports.length > 0 ? userReports : []).map((report) => (
                <div
                  key={report.id}
                  onClick={() => openReportDetails(report)}
                  className="cursor-pointer bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center space-x-4 hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <div className="h-16 w-16 bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center text-xs text-slate-400 flex-shrink-0">
                    {report.photo ? <img src={report.photo} alt="Report preview" className="h-full w-full object-cover" /> : 'Thumb'}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-900">{report.damage_level || 'Damage Report'}</div>
                    <div className="text-xs text-slate-600 mt-1">
                      {report.landmark_description || 'Location not specified'} • {new Date(report.submitted_at).toLocaleString()}
                    </div>
                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-red-600">
                      {report.syncStatus || 'PENDING SYNC'}
                    </div>
                  </div>
                </div>
              ))}
              {userReports.length === 0 && (
                <div className="bg-white rounded-2xl p-6 border border-dashed border-slate-300 text-center text-slate-600">
                  No local reports yet. Take a photo and submit one to see it here.
                </div>
              )}
            </div>
          </div>
        )}

        {mode === 'form' && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMode('map')}></div>
            <div className="relative w-full max-w-3xl bg-white rounded-t-3xl shadow-2xl max-h-[90vh] overflow-auto sentra-form-sheet">
              <div className="w-full flex items-center justify-center py-3">
                <div className="h-1.5 w-24 bg-slate-200 rounded-full"></div>
              </div>
              <div className="p-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="flex items-center space-x-4">
                    <div className="h-14 w-14 bg-slate-100 rounded-lg overflow-hidden">
                      {photoPreview ? <img src={photoPreview} className="w-full h-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">Thumb</div>}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">New Damage Report</h3>
                      <div className="text-xs text-slate-500 mt-1">{new Date().toLocaleString()}</div>
                    </div>
                  </div>

                  {renderProgress()}

                  {step === 1 && renderStep1()}
                  {step === 2 && renderStep2()}
                  {step === 3 && renderStep3()}
                  {step === 4 && renderStep4()}
                  {step === 5 && renderStep5()}
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedReport && (
        <div className="fixed inset-0 z-[2500] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={closeReportDetails}></div>
          <div className="relative w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-auto">
            <div className="p-5 sm:p-6 space-y-4 text-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-extrabold">Damage Report Details</h3>
                  <p className="text-sm text-slate-500 mt-1">Full report view from the user map</p>
                </div>
                <button type="button" onClick={closeReportDetails} className="h-10 w-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                  <ChevronLeft className="h-5 w-5 rotate-180" />
                </button>
              </div>

              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                {selectedReport.photo ? (
                  <img src={selectedReport.photo} alt="Selected report" className="w-full h-64 object-cover" />
                ) : (
                  <div className="h-64 flex items-center justify-center text-slate-400">No photo available</div>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4"><div className="text-slate-500 text-xs uppercase font-bold">Damage Level</div><div className="font-semibold mt-1">{selectedReport.damage_level || '-'}</div></div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4"><div className="text-slate-500 text-xs uppercase font-bold">Sync Status</div><div className="font-semibold mt-1">{selectedReport.syncStatus || 'SYNCED'}</div></div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4"><div className="text-slate-500 text-xs uppercase font-bold">Infrastructure</div><div className="font-semibold mt-1">{selectedReport.infrastructure_type?.join(', ') || '-'}</div></div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4"><div className="text-slate-500 text-xs uppercase font-bold">Crisis Type</div><div className="font-semibold mt-1">{selectedReport.crisis_type?.join(', ') || '-'}</div></div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 sm:col-span-2"><div className="text-slate-500 text-xs uppercase font-bold">Location</div><div className="font-semibold mt-1">{selectedReport.landmark_description || 'Location not specified'}</div></div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 sm:col-span-2"><div className="text-slate-500 text-xs uppercase font-bold">Description</div><div className="font-semibold mt-1 whitespace-pre-wrap">{selectedReport.description || '-'}</div></div>
              </div>

              <button type="button" onClick={closeReportDetails} className="w-full h-12 rounded-2xl bg-slate-900 text-white font-bold">Close</button>
            </div>
          </div>
        </div>
      )}

      {showEmergencySent && (
        <div className="fixed inset-0 z-[2600] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowEmergencySent(false)}></div>
          <div className="relative w-full max-w-md bg-red-600 text-white rounded-3xl p-8 text-center shadow-2xl">
            <div className="mx-auto w-20 h-20 bg-white rounded-full flex items-center justify-center text-red-600 mb-5">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <h3 className="text-3xl font-extrabold">Emergency SOS Active</h3>
            <p className="mt-3 text-white/90 leading-relaxed">Your emergency alert has been sent to the admin portal.</p>
            <button type="button" onClick={() => setShowEmergencySent(false)} className="mt-6 w-full h-12 rounded-2xl bg-white text-red-600 font-bold">
              Close
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation (user style) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-800 py-3 z-40">
        <div className="max-w-3xl mx-auto px-6 flex items-center justify-between">
          <button onClick={() => {
            if (!navigator.mediaDevices?.getUserMedia) {
              globalCameraInputRef.current?.click();
            } else {
              setMode('camera');
            }
          }} className={`flex-1 flex flex-col items-center ${mode==='camera' ? 'text-blue-400' : 'text-slate-300'}`}>
            <Camera className="h-6 w-6" />
          </button>
          <button onClick={() => setMode('map')} className="-mt-6 bg-blue-600 h-14 w-14 rounded-full flex items-center justify-center text-white shadow-lg">
            <MapPin className="h-6 w-6" />
          </button>
          <button onClick={() => setMode('history')} className={`flex-1 flex flex-col items-center ${mode==='history' ? 'text-blue-400' : 'text-slate-300'}`}>
            <RefreshCw className="h-6 w-6" />
          </button>
        </div>
      </nav>
      {/* Global Fallback Camera Input for HTTP connections */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment"
        ref={globalCameraInputRef} 
        onChange={handlePhotoSelect} 
        className="hidden"
      />
    </div>
  );
}

// Center coordinates for Chennai
const CHENNAI_LAT = 13.0827;
const CHENNAI_LNG = 80.2707;
