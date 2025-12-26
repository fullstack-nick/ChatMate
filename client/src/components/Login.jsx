import { useRef, useState, useEffect, useContext } from 'react';
import { Link, useNavigate, useLocation, replace } from 'react-router-dom';
import Header from './Header'
import axios from '../api/axios';
import AuthContext from "../context/AuthProvider";
import useToggle from '../hooks/useToggle';
import { ToastContainer, toast } from 'react-toastify';
import { connectSocket } from '../api/socket';

const Login = ({ stateSessionID, errMsg, setErrMsg }) => {
    const { setAuth } = useContext(AuthContext);
    const { auth } = useContext(AuthContext);

    const [username, setUsername] = useState('');
    const [pwd, setPwd] = useState('');
    const [check, toggleCheck] = useToggle('persist', false);

    const navigate = useNavigate();
    const location = useLocation();
    const locationState = location.state;

    const userRef = useRef();
    const submitInFlight = useRef(false);

    useEffect(() => {
        if (errMsg) {
            const toastId = errMsg === 'Please log in again!' ? 'auth-expired' : errMsg;
            toast.error(errMsg, { toastId });
            const t = setTimeout(() => setErrMsg(''), 5000);
            return () => clearTimeout(t);
        }
    }, [errMsg])

    useEffect(() => {
      userRef.current.focus();
    }, [])

    useEffect(() => {
      setErrMsg('');
    }, [username, pwd])

    
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (submitInFlight.current) return;
        submitInFlight.current = true;
        const savedSessionID = (stateSessionID.length > 0 && stateSessionID[0] !== null) ? stateSessionID : null;
        const lastSessionID = stateSessionID[stateSessionID.length - 1];
        const persist = JSON.parse(localStorage.getItem("persist"));

        try {
            const dataToSend = savedSessionID ? JSON.stringify({ username, pwd, persist, lastSessionID }) : JSON.stringify({ username, pwd, persist });
            const response = await axios.post('/auth',
                dataToSend,
                {
                    headers: { 'Content-Type': 'application/json' },
                    withCredentials: true
                }
            );
            const accessToken = response?.data?.accessToken;
            const roles = response?.data?.roles;
            const sessionID = response?.data?.sessionID;
            setAuth({ username, pwd, roles, accessToken, sessionID, isTrusted: persist });
            connectSocket({ accessToken, sessionID });
            setUsername('');
            setPwd('');
            navigate('/main');
        } catch (err) {
            if (!err?.response) {
                setErrMsg('No server response');
            } else if (err.response?.status === 400) {
                setErrMsg('Missing Username or Password');
            } else if (err.response?.status === 401) {
                setErrMsg('Unauthorized');
            } else {
                setErrMsg('Login Failed');
            }
        } finally {
            submitInFlight.current = false;
        }
    }

  return (
    <section className='flex flex-col'>
        <Header />
        <div className='h-[75vh] flex justify-center items-center'>
            <div id='loginForm' className='relative w-88 h-88 border border-black rounded-2xl bg-[#F5F5F5] flex flex-col items-center'>
                <ToastContainer theme="colored"/>
                <form id='signInForm' onSubmit={handleSubmit} className='flex flex-col items-center'>
                    <label htmlFor="username" className='block font-semibold'>Username:</label>
                    <input
                        type="text"
                        id='username'
                        ref={userRef}
                        autoComplete='off'
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                    />

                    <label htmlFor="password" className='block font-semibold'>Password:</label>
                    <input
                        type="password"
                        id='password'
                        value={pwd}
                        onChange={(e) => setPwd(e.target.value)}
                        required
                    />

                    <div className="persistCheck">
                        <input
                            type="checkbox"
                            id="persist"
                            onChange={toggleCheck}
                            checked={check}
                        />
                        <label htmlFor="persist">Trust This Device</label>
                    </div>

                    <button id='signIn_btn' className='w-30 h-10 border rounded-2xl cursor-pointer inline-block font-semibold active:text-gray-500'>Sign In</button>
                </form>

                <div id='resetDiv' className='absolute bottom-0'>
                    <p className='text-center font-semibold'>
                        Forgot your password?<br />
                        <span className='flex justify-center text-sm'>
                            <Link to="/reset" className='text-blue-600 hover:text-blue-800 hover:underline font-medium transition'>Reset password</Link>
                        </span>
                    </p>
                    <p className='text-center font-semibold'>
                        Need an account?<br />
                        <span className='flex justify-center text-sm'>
                            <Link to="/register" className='text-blue-600 hover:text-blue-800 hover:underline font-medium transition'>Sign up</Link>
                        </span>
                    </p>
                </div>
            </div>
        </div>
    </section>
  )
}

export default Login
