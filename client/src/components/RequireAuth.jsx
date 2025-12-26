import { useLocation, Navigate, Outlet, useNavigate } from "react-router-dom";
import AuthContext from "../context/AuthProvider";
import { useContext, useEffect, useState } from "react";
import { axiosAccessToken } from '../api/axios';
import useLocalStorage from "../hooks/useLocalStorage";
import { motion } from "framer-motion";

const RequireAuth = ({ allowedRoles, setErrMsg }) => {
    const { auth, setAuth } = useContext(AuthContext);
    const location = useLocation();
    const navigate  = useNavigate();
    const [tokenIsValid, setTokenIsValid] = useState(null);
    const [persist] = useLocalStorage('persist', false);
    const userIsLoggedIn = Boolean(auth.username && auth.roles);

    useEffect(() => {
        if (!auth.accessToken) return;

      const verifyAccessToken = async () => {
        try {
            const response = await axiosAccessToken(auth.accessToken).get('/verifyAccess');
            const isValid = response.status === 200;
            setTokenIsValid(isValid);
            if (!isValid) {
                setAuth(prev => ({ ...prev, accessToken: '' }));
            }
        } catch (err) {
            setTokenIsValid(false);
            setAuth(prev => ({ ...prev, accessToken: '' }));
            if (!err?.response) {
                console.log('No server response');
            } else {
                console.log('Access token verification failed');
            }
        }
      }

      verifyAccessToken();
    }, [auth.accessToken]);

    useEffect(() => {
        if (auth.username && auth.roles && (!auth.accessToken || auth.accessToken === '')) {
            if (!persist) {
                setAuth({});
                setTokenIsValid(null);
                setErrMsg('Please log in again!');
                navigate('/login', { state: { from: location }, replace: true });
            }
            setTokenIsValid(false);
        }
        if (!userIsLoggedIn) {
            setAuth({});
            setTokenIsValid(null);
            setErrMsg('Please log in again!');
            navigate('/login', { state: { from: location }, replace: true });
        }

    }, [auth.accessToken]);

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
        <>
            {tokenIsValid === null ? Loader : (!tokenIsValid || !auth?.accessToken ? (
                persist ? (
                    Loader
                ) : (
                    <Navigate to="/login" state={{ from: location, errMsg: "Session has expired, please log in again." }} replace />
                )
            ) : auth?.roles?.find(role => allowedRoles?.includes(role)) ? (
                <Outlet />
            ) : (
                <Navigate to="/unauthorized" state={{ from: location }} replace />
            ))}
        </>
    );
}

export default RequireAuth;
