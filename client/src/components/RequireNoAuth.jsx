import { useLocation, Navigate, Outlet } from 'react-router-dom';
import { useContext } from "react";
import AuthContext from "../context/AuthProvider";

const RequireNoAuth = () => {
  const { auth } = useContext(AuthContext);
  const location = useLocation();

  if (auth.username && auth.roles && auth.accessToken) {
    return <Navigate to="/main" state={{ from: location }} replace />;
  }

  return <Outlet />;
};

export default RequireNoAuth;
