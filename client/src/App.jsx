import { useState, useEffect, useContext, useRef } from 'react';
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import Register from './components/Register';
import Login from './components/Login';
import Layout from './components/Layout';
import Main from './components/Main';
import RequireAuth from './components/RequireAuth';
import RequireNoAuth from './components/RequireNoAuth';
import PersistLogin from './components/PersistLogin';
import Unauthorized from './components/Unauthorized';
import Missing from './components/Missing';
import ResetPassword from './components/ResetPassword';
import { ROLES } from './config/roles'
import './App.css'
import { Routes, Route } from 'react-router-dom';
import AuthContext from "./context/AuthProvider";
import { jwtDecode } from "jwt-decode";
import axios from './api/axios';
import { socket, disconnectSocket } from './api/socket';

function App() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [errMsg, setErrMsg] = useState('');
  const { auth, setAuth } = useContext(AuthContext);
  const [stateSessionID, setStateSessionID] = useState([null]);
  const [forcedLogout, setForcedLogout] = useState(false);
  const logoutInFlight = useRef(false);
  const userIsLoggedIn = Boolean(auth.username && auth.roles);
  
  useEffect(() => {
    const onConnect = () => console.log("connected, socket.id:", socket.id);
    const onConnectError = (err) => {
      console.warn("socket connect_error:", err?.message);
    };
    const onForceLogout = () => {
      disconnectSocket();
      setAuth({});
      setErrMsg('Please log in again!');
      navigate('/login', { state: { from: location }, replace: true });
    };
    const onTrustedChange = ({ isTrusted }) => {
      localStorage.setItem("persist", JSON.stringify(isTrusted));
      setAuth(prev => ({
        ...prev,
        isTrusted: isTrusted
      }));
    }
    socket.on("connect", onConnect);
    socket.on("connect_error", onConnectError);
    socket.on("forceLogout", onForceLogout);
    socket.on("trustedStatusChanged", onTrustedChange);
  }, [])

  const callLogout = async (overrideSessionID) => {
    if (logoutInFlight.current) return;
    const lastSessionID = overrideSessionID ?? ((stateSessionID.length > 0 && stateSessionID[0] !== null) ? stateSessionID[stateSessionID.length - 1] : null);
    if (!lastSessionID) return;
    logoutInFlight.current = true;

    try {
      const response = await axios.post('/logout',
          { lastSessionID },
          {
              headers: { 'Content-Type': 'application/json' },
              withCredentials: true
          }
      );
      const logoutSuccess = response.status === 204;
      console.log(logoutSuccess);
    } catch (err) {
      if (!err?.response) {
          setErrMsg('No server response');
      } else {
          setErrMsg('Logout Failed');
      }
    } finally {
      sessionStorage.removeItem("sessionID");
      logoutInFlight.current = false;
    }
  }

  useEffect(() => {
    if (auth.sessionID && auth.sessionID !== '') {
      if (stateSessionID[0] === null) {
        setStateSessionID([auth.sessionID]);
      }
      setStateSessionID(prev => [...prev, auth.sessionID]);
      sessionStorage.setItem("sessionID", auth.sessionID);
    }
  }, [auth.sessionID]);
  

  useEffect(() => {
    const rawPersist = localStorage.getItem("persist");
    if (rawPersist === null) {
      localStorage.setItem("persist", JSON.stringify(false));
    } else {
      try {
        const parsed = JSON.parse(rawPersist);
        if (parsed && typeof parsed === "object" && Object.prototype.hasOwnProperty.call(parsed, "isTrusted")) {
          localStorage.setItem("persist", JSON.stringify(Boolean(parsed.isTrusted)));
        }
      } catch {
        localStorage.setItem("persist", JSON.stringify(false));
      }
    }
    const persist = JSON.parse(localStorage.getItem("persist"));
    const storedSessionID = sessionStorage.getItem("sessionID");
    if (!persist && storedSessionID) {
      (async () => {
        await callLogout(storedSessionID);
        setAuth({});
        setErrMsg('Please log in again!');
        navigate('/login', { state: { from: location }, replace: true });
      })();
    }
  }, []);

  useEffect(() => {
    if (!auth?.accessToken || !auth?.sessionID) return;
    socket.auth = { accessToken: auth.accessToken, sessionID: auth.sessionID };
    if (!socket.connected) {
      socket.connect();
    }
  }, [auth.accessToken, auth.sessionID]);

  useEffect(() => {
    if (auth.accessToken && auth.accessToken !== '') {
      const { exp } = jwtDecode(auth.accessToken);
      const timeout = exp * 1000 - Date.now();

      if (timeout > 0) {
        const timer = setTimeout(() => {
          const persist = JSON.parse(localStorage.getItem("persist"));
          if (!persist) {
              setAuth({});
              setErrMsg('Please log in again!');
              navigate('/login', { state: { from: location }, replace: true });
          }
        }, timeout);

        return () => clearTimeout(timer);
      } else {
        const persist = JSON.parse(localStorage.getItem("persist"));
        if (!persist) {
            setAuth({});
            setErrMsg('Please log in again!');
            navigate('/login', { state: { from: location }, replace: true });
        }
      }
    }

    if (stateSessionID[0] !== null && !userIsLoggedIn && !forcedLogout) {

      // here sending logout request
      (async () => {
        await callLogout();

        setAuth({});
        setErrMsg('Please log in again!');
        navigate('/login', { state: { from: location }, replace: true });
      })();
    }
  }, [auth.accessToken]);

  useEffect(() => {
    if (forcedLogout) {
      setForcedLogout(false);

      (async () => {
        await callLogout();

        setAuth({});
        setErrMsg('Please log in again!');
        navigate('/login', { state: { from: location }, replace: true });
      })();
    }

  }, [forcedLogout]);

  useEffect(() => {
    if (!userIsLoggedIn) {
      setForcedLogout(false);
    }
  }, [userIsLoggedIn]);
  
  

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to={userIsLoggedIn ? "/main" : "/login"} replace />} />
        
        <Route element={<RequireNoAuth />}>
          <Route path="login" element={<Login stateSessionID={stateSessionID} errMsg={errMsg} setErrMsg={setErrMsg} />} />
          <Route path="register" element={<Register errMsg={errMsg} setErrMsg={setErrMsg} />} />
          <Route path="reset" element={<ResetPassword errMsg={errMsg} setErrMsg={setErrMsg} />} />
        </Route>

        <Route path="unauthorized" element={<Unauthorized />} />
        {/* MAIN ELEMENT TEMPORARILY REMOVED FROM HERE */}
       

        {/* PROTECTED ROUTES START HERE */}
        <Route element={<PersistLogin />}>
          <Route element={<RequireAuth allowedRoles={[ROLES.User]} errMsg={errMsg} setErrMsg={setErrMsg} />}>
           {/* MAIN ELEMENT TEMPORARILY REMOVED FROM HERE */}
            <Route path="main/*" element={<Main setForcedLogout={setForcedLogout} />} />
          </Route>
        </Route>

        <Route path="*" element={<Missing />} />
      </Route>
    </Routes>
  )
}

export default App
