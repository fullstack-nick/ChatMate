import { Outlet } from "react-router-dom";
import { useState, useEffect, useContext } from "react";
import useRefreshToken from '../hooks/useRefreshToken';
import AuthContext from "../context/AuthProvider";
import useLocalStorage from "../hooks/useLocalStorage";
import { motion } from "framer-motion";

const PersistLogin = () => {
    const [isLoading, setIsLoading] = useState(true);
    const refresh = useRefreshToken();
    const { auth } = useContext(AuthContext);
    const [persist] = useLocalStorage('persist', false);

    const Loader = (
        <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <motion.div
            className="w-24 h-24 border-8 border-t-transparent border-blue-500 rounded-full"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
        />
        </div>
    );

    useEffect(() => {
        let isMounted = true;

        const verifyRefreshToken = async () => {
            try {
                await refresh();
            }
            catch (err) {
                console.error(err);
            }
            finally {
                isMounted && setIsLoading(false);
            }
        }

        ((auth?.accessToken === '' || !auth?.accessToken) && persist) ? verifyRefreshToken() : setIsLoading(false);

        return () => isMounted = false;
    }, [auth.accessToken])

    return (
        <>
            {isLoading
                ? Loader
                : <Outlet />
            }
        </>
    )
}

export default PersistLogin