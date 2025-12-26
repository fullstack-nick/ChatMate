import { useRef, useState, useEffect, useContext } from 'react';
import { Link, useNavigate, useLocation, replace } from 'react-router-dom';
import Header from './Header'
import axios from '../api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { faCircleCheck } from '@fortawesome/free-solid-svg-icons';
import { ToastContainer, toast } from 'react-toastify';

const PWD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%]).{8,24}$/;

const Register = ({ errMsg, setErrMsg }) => {
  const [username, setUsername] = useState('');

  const [pwd, setPwd] = useState('');
  const [validPwd, setValidPwd] = useState(false);
  const [pwdFocus, setPwdFocus] = useState(false);

  const [matchPwd, setMatchPwd] = useState('');
  const [validMatch, setValidMatch] = useState(false);

  const [success, setSuccess] = useState(false);

  const userRef = useRef();
  const submitInFlight = useRef(false);

  useEffect(() => {
    if (errMsg) {
      toast.error(errMsg);
      const t = setTimeout(() => setErrMsg(''), 5000);
      return () => clearTimeout(t);
    }
  }, [errMsg])
  

  useEffect(() => {
    if (!success) {
      userRef.current.focus();
    }
  }, [])

  useEffect(() => {
    setValidPwd(PWD_REGEX.test(pwd));
    setValidMatch(pwd === matchPwd);
  }, [pwd, matchPwd])

  useEffect(() => {
    setErrMsg('');
  }, [username, pwd, matchPwd])
  

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitInFlight.current) return;
    
    if(!validPwd || !validMatch) {
      setErrMsg('Invalid Password');
      return;
    } else {
      submitInFlight.current = true;
      try {
        const response = await axios.post('/reset',
          JSON.stringify({ username, pwd }),
          {
            headers: { 'Content-Type': 'application/json' },
            withCredentials: true
          }
        );
        console.log(JSON.stringify(response?.data));
        setUsername('');
        setPwd('');
        setMatchPwd('');
        setSuccess(true);
      } catch (err) {
        if (!err?.response) {
          setErrMsg('No Server Response');
        } else if (err.response?.status === 409) {
          setErrMsg('Error!');
        } else {
          setErrMsg('Reset Failed');
        }
      } finally {
        submitInFlight.current = false;
      }
    }
  }

  return (
    <section className='flex flex-col'>
      <Header />
      <div className='h-[75vh] flex justify-center items-center'>
          {success ? (
            <div className='w-88 h-88 border border-black rounded-2xl bg-[#F5F5F5] flex flex-col items-center justify-center'>
              <FontAwesomeIcon icon={faCircleCheck} style={{color: "#339DFF",}} className='text-9xl' id='success_circle' />
              <h1 id='success_note' className='text-center font-bold text-3xl'>Success!</h1>
              <span className='flex justify-center text-xl'>
                  <Link to="/login" className='text-blue-600 hover:text-blue-800 hover:underline font-medium transition'>Log In</Link>
              </span>
            </div>
          ) : (
            <div id='loginForm' className='relative w-88 h-88 border border-black rounded-2xl bg-[#F5F5F5] flex flex-col items-center'>
              <ToastContainer theme="colored"/>
              <form id='registerForm' onSubmit={handleSubmit} className='flex flex-col items-center'>
                <div className='relative w-80 flex flex-col items-center'>
                  <label htmlFor="username" className='block font-semibold text-center'>Username:</label>
                  <input
                      type="text"
                      id='username'
                      ref={userRef}
                      autoComplete='off'
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                  />
                </div>

                <div className='relative w-80 flex flex-col items-center'>
                  <p id='pwd_note' className={pwdFocus && pwd && !validPwd ? 'instructions' : 'offscreen'}>
                    <FontAwesomeIcon icon={faCircleInfo} />
                    <span className='inline-block w-63'>
                      8 to 24 characters.<br />
                      Must include uppercase and lowercase letters, a number and a special character.<br />
                      Allowed special characters: <span aria-label="exclamation mark">!</span> <span aria-label="at symbol">@</span> <span aria-label="hashtag">#</span> <span aria-label="dollar sign">$</span> <span aria-label="percent">%</span>
                    </span>
                  </p>
                  <label htmlFor="password" className='block font-semibold text-center'>New Password:</label>
                  <input
                      type="password"
                      id='password'
                      value={pwd}
                      onChange={(e) => setPwd(e.target.value)}
                      required
                      onFocus={() => setPwdFocus(true)}
                      onBlur={() => setPwdFocus(false)}
                  />
                </div>

                  <div className='relative w-80 flex flex-col items-center'>
                    <p id='match_note' className={matchPwd && !validMatch ? 'instructions' : 'offscreen'}>
                      <FontAwesomeIcon icon={faCircleInfo} />
                      <span className='inline-block'>
                        Must match the password input field.
                      </span>
                    </p>
                    <label htmlFor="match_pwd" className='block font-semibold text-center'>Repeat password:</label>
                    <input
                        type="password"
                        id='match_pwd'
                        value={matchPwd}
                        onChange={(e) => setMatchPwd(e.target.value)}
                        required
                    />
                  </div>

                  <button id='register_btn' className='block w-30 h-10 border rounded-2xl cursor-pointer font-semibold active:text-gray-500'>Reset</button>
              </form>

              <div className='absolute bottom-0'>
                  <p id='accountExists' className='text-center font-semibold'>
                      Want to log in?<br />
                      <span className='flex justify-center text-sm'>
                          <Link to="/login" className='text-blue-600 hover:text-blue-800 hover:underline font-medium transition'>Log In</Link>
                      </span>
                  </p>
              </div>
            </div>
          )}
      </div>
    </section>
  )
}

export default Register
