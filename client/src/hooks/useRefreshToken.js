import axios from "../api/axios";
import AuthContext from "../context/AuthProvider";
import { useContext } from "react";
import { jwtDecode } from "jwt-decode";

const useRefreshToken = () => {
  const { setAuth } = useContext(AuthContext);

  const refresh = async () => {
    const response = await axios.get("/refresh", {
      withCredentials: true,
    });
    const accessToken = response?.data?.accessToken;
    const sessionID = response?.data?.sessionID;
    const isTrusted = response?.data?.isTrusted;
    const decoded = accessToken ? jwtDecode(accessToken) : null;
    const username = decoded?.UserInfo?.username;
    if (typeof isTrusted === "boolean") {
      localStorage.setItem("persist", JSON.stringify(isTrusted));
    }
    setAuth((prev) => {
      return {
        ...prev,
        roles: response.data.roles,
        accessToken,
        username: username || prev?.username,
        sessionID: sessionID || prev?.sessionID,
        isTrusted: typeof isTrusted === "boolean" ? isTrusted : prev?.isTrusted,
      };
    });
    return accessToken;
  };
  return refresh;
};

export default useRefreshToken;
