import { useEffect, useState, useContext } from "react";
import { motion } from "framer-motion";
import AuthContext from "../context/AuthProvider";
import axios from '../api/axios';

const SettingsPopup = ({ showSettingsPopup, setShowSettingsPopup, errMsg, setErrMsg, setForcedLogout }) => {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const { auth, setAuth } = useContext(AuthContext);
  
    useEffect(() => {
      if (!showSettingsPopup) return;
      (async () => {
        try {
            setLoading(true);
            setErrMsg('');
            const res = await axios.get('/user/devices', {
                params: { username: auth.username }
            });
            const data = res.data;
            console.log(data);
            /* OR JUST DATA BELOW INSTEAD OF DATA.DEVICES */
            setDevices(data.devices || []);

        } catch (err) {
            setErrMsg(err.message || 'Error loading devices');
        } finally {
            setLoading(false);
        }
      })();
    }, [showSettingsPopup])

    const currentSessionID = auth.sessionID || sessionStorage.getItem("sessionID");

    useEffect(() => {
        if (!showSettingsPopup || !currentSessionID) return;
        const currentDevice = devices.find(
            (d) => d.activeSession === currentSessionID && d.sessionIsActive
        );
        if (!currentDevice || typeof currentDevice.isTrusted !== "boolean") return;

        setAuth((prev) => {
            if (prev.isTrusted === currentDevice.isTrusted) return prev;
            localStorage.setItem("persist", JSON.stringify(currentDevice.isTrusted));
            return { ...prev, isTrusted: currentDevice.isTrusted };
        });
    }, [devices, showSettingsPopup, currentSessionID, setAuth]);

    const currentDevice = devices.find(
        (d) => d.activeSession === currentSessionID && d.sessionIsActive
    );
    const effectiveTrusted = typeof auth.isTrusted === "boolean"
        ? auth.isTrusted
        : Boolean(currentDevice?.isTrusted);

    const toggleTrust = async (device) => {
        if (!effectiveTrusted || !device.activeSession || !device.sessionIsActive) return;
        try {
            setBusyId(device._id);
            const res = await axios.patch("/user/patch", { username: auth.username, deviceID: device._id, sessionID: device.activeSession, isTrusted: !device.isTrusted });
            if (res.status === 200) console.log('Successfully patched!');
            setDevices((prev) =>
                prev.map((d) => (d._id === device._id ? { ...d, isTrusted: !d.isTrusted} : d))
            );
        } catch (err) {
            setErrMsg(err.message || 'Error changing trusted state');
        } finally {
            setBusyId(null);
        }
    }

    const logOutDevice = async (device) => {
        if (!effectiveTrusted || !device.activeSession || !device.sessionIsActive) return;
        try {
            setBusyId(device._id);
            const response = await axios.post('/logout/id', { sessionID: device.activeSession });
            const logoutSuccess = response.status === 204;
            console.log(logoutSuccess);
            setDevices((prev) =>
                prev.map((d) => (d._id === device._id ? { ...d, sessionIsActive: false, pastSessions: [...d.pastSessions, d.activeSession], activeSession: ''} : d))
            )
        } catch (err) {
            setErrMsg(err.message || 'Error logging out device');
        } finally {
            setBusyId(null);
        }
    }

    let disabledReason =
    !effectiveTrusted
      ? "Only trusted devices can modify other devices."
      : null;

    const Loader = (
        <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <motion.div
            className="w-24 h-24 border-8 border-t-transparent border-blue-500 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        />
        </div>
    );

  return (
   <section
    onClick={(e) => e.stopPropagation()}
    className={`relative flex flex-col justify-start items-stretch h-100 w-130 rounded-2xl shadow-2xl bg-white transition ${
        showSettingsPopup ? "opacity-100" : "opacity-0 pointer-events-none"
    }`}
   >
    <button
        onClick={() => setShowSettingsPopup(false)}
        className="absolute top-4 right-4 text-2xl font-bold active:scale-90 text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        aria-label="Close"
    >
        &times;
    </button>

    <header className="px-6 pt-6 pb-3">
        <h2 className="text-xl font-semibold text-slate-900">Active devices</h2>
        {!effectiveTrusted && (
            <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Only <strong>trusted</strong> devices can mark other devices as trusted
            or log them out. You can still view the list below.
            </p>
        )}
    </header>

    <div className="px-2 pb-6">
        {loading ? (
            Loader
        ) : devices.length === 0 ? (
          <div className="px-4 py-6 text-slate-600">No active devices.</div>
        ) : (
          <ul className="max-h-96 overflow-y-auto divide-y divide-slate-200 bg-white rounded-xl border border-slate-200">
            {devices
              .filter(d => Boolean(d.sessionIsActive))
              .map((d, idx) => {
                const isCurrent = d.activeSession === currentSessionID;
                const canAct = effectiveTrusted && !isCurrent && busyId !== d._id;
                const displayTrusted = isCurrent ? effectiveTrusted : d.isTrusted;

                return (
                  <li
                    key={d._id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">#{idx + 1}</span>
                        {isCurrent && (
                          <span className="text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                            This device
                          </span>
                        )}
                      </div>
                      <div className="mt-1 font-mono text-sm text-slate-900 truncate">
                        id: {d._id}
                      </div>
                      <div className="mt-0.5">
                        {displayTrusted ? (
                          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            Trusted
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                            Not trusted
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => toggleTrust(d)}
                        disabled={!canAct}
                        title={disabledReason || (isCurrent ? "Cannot change current device." : "")}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition active:translate-y-px ${
                          canAct
                            ? "bg-white border-slate-300 hover:bg-slate-50"
                            : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        {displayTrusted ? "Make non-trusted" : "Make trusted"}
                      </button>

                      <button
                        onClick={() => logOutDevice(d)}
                        disabled={!canAct}
                        title={disabledReason || (isCurrent ? "Cannot log out the current device." : "")}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition active:translate-y-px ${
                          canAct
                            ? "bg-white border-slate-300 hover:bg-slate-50"
                            : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                        }`}
                      >
                        Log out
                      </button>
                    </div>
                  </li>
                );
            })}
          </ul>
        )}
      </div>

   </section>
  )
}

export default SettingsPopup
