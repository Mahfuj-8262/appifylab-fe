import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as api from '../api';

// Auth page — login.html and registration.html merged into a single page.
// The route drives which view shows (/login vs /register); the background shapes
// are shared. Registration collects first name, last name, email and password
// as required by the task (the template only shipped email/password/repeat).
// NOTE: submit is a placeholder that just marks the session locally — the real
// login/register API calls are wired in the backend-integration step.
export default function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  const mode = location.pathname === '/register' ? 'register' : 'login';

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    repeatPassword: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const goToRegister = (e) => {
    e.preventDefault();
    navigate('/register');
  };
  const goToLogin = (e) => {
    e.preventDefault();
    navigate('/login');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'register' && form.password !== form.repeatPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (mode === 'register' && form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'login') {
        await api.login({ email: form.email, password: form.password });
      } else {
        await api.register({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          password: form.password,
        });
      }
      navigate('/feed');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className={
        (mode === 'login' ? '_social_login_wrapper' : '_social_registration_wrapper') +
        ' _layout_main_wrapper'
      }
    >
      <div className="_shape_one">
        <img src="/assets/images/shape1.svg" alt="" className="_shape_img" />
        <img src="/assets/images/dark_shape.svg" alt="" className="_dark_shape" />
      </div>
      <div className="_shape_two">
        <img src="/assets/images/shape2.svg" alt="" className="_shape_img" />
        <img src="/assets/images/dark_shape1.svg" alt="" className="_dark_shape _dark_shape_opacity" />
      </div>
      <div className="_shape_three">
        <img src="/assets/images/shape3.svg" alt="" className="_shape_img" />
        <img src="/assets/images/dark_shape2.svg" alt="" className="_dark_shape _dark_shape_opacity" />
      </div>

      {mode === 'login' && (
        <div className="_social_login_wrap">
          <div className="container">
            <div className="row align-items-center">
              <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
                <div className="_social_login_left">
                  <div className="_social_login_left_image">
                    <img src="/assets/images/login.png" alt="" className="_left_img" />
                  </div>
                </div>
              </div>
              <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
                <div className="_social_login_content">
                  <div className="_social_login_left_logo _mar_b28">
                    <img src="/assets/images/logo.svg" alt="" className="_left_logo" />
                  </div>
                  <p className="_social_login_content_para _mar_b8">Welcome back</p>
                  <h4 className="_social_login_content_title _titl4 _mar_b50">Login to your account</h4>
                  <button type="button" className="_social_login_content_btn _mar_b40">
                    <img src="/assets/images/google.svg" alt="" className="_google_img" />{' '}
                    <span>Or sign-in with google</span>
                  </button>
                  <div className="_social_login_content_bottom_txt _mar_b40">
                    {' '}
                    <span>Or</span>
                  </div>
                  <form className="_social_login_form" onSubmit={handleSubmit}>
                    <div className="row">
                      <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                        <div className="_social_login_form_input _mar_b14">
                          <label className="_social_login_label _mar_b8">Email</label>
                          <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={onChange}
                            className="form-control _social_login_input"
                          />
                        </div>
                      </div>
                      <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                        <div className="_social_login_form_input _mar_b14">
                          <label className="_social_login_label _mar_b8">Password</label>
                          <input
                            type="password"
                            name="password"
                            value={form.password}
                            onChange={onChange}
                            className="form-control _social_login_input"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="row">
                      <div className="col-lg-6 col-xl-6 col-md-6 col-sm-12">
                        <div className="form-check _social_login_form_check">
                          <input
                            className="form-check-input _social_login_form_check_input"
                            type="radio"
                            name="flexRadioDefault"
                            id="flexRadioDefault2"
                            defaultChecked
                          />
                          <label className="form-check-label _social_login_form_check_label" htmlFor="flexRadioDefault2">
                            Remember me
                          </label>
                        </div>
                      </div>
                      <div className="col-lg-6 col-xl-6 col-md-6 col-sm-12">
                        <div className="_social_login_form_left">
                          <p className="_social_login_form_left_para">Forgot password?</p>
                        </div>
                      </div>
                    </div>
                    {error && (
                      <div className="row">
                        <div className="col-12">
                          <p style={{ color: '#e53e3e', marginTop: 8 }}>{error}</p>
                        </div>
                      </div>
                    )}
                    <div className="row">
                      <div className="col-lg-12 col-md-12 col-xl-12 col-sm-12">
                        <div className="_social_login_form_btn _mar_t40 _mar_b60">
                          <button type="submit" className="_social_login_form_btn_link _btn1" disabled={submitting}>
                            {submitting ? 'Logging in…' : 'Login now'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                  <div className="row">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                      <div className="_social_login_bottom_txt">
                        <p className="_social_login_bottom_txt_para">
                          Dont have an account? <a href="#0" onClick={goToRegister}>Create New Account</a>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === 'register' && (
        <div className="_social_registration_wrap">
          <div className="container">
            <div className="row align-items-center">
              <div className="col-xl-8 col-lg-8 col-md-12 col-sm-12">
                <div className="_social_registration_right">
                  <div className="_social_registration_right_image">
                    <img src="/assets/images/registration.png" alt="" />
                  </div>
                  <div className="_social_registration_right_image_dark">
                    <img src="/assets/images/registration1.png" alt="" />
                  </div>
                </div>
              </div>
              <div className="col-xl-4 col-lg-4 col-md-12 col-sm-12">
                <div className="_social_registration_content">
                  <div className="_social_registration_right_logo _mar_b28">
                    <img src="/assets/images/logo.svg" alt="" className="_right_logo" />
                  </div>
                  <p className="_social_registration_content_para _mar_b8">Get Started Now</p>
                  <h4 className="_social_registration_content_title _titl4 _mar_b50">Registration</h4>
                  <button type="button" className="_social_registration_content_btn _mar_b40">
                    <img src="/assets/images/google.svg" alt="" className="_google_img" />{' '}
                    <span>Register with google</span>
                  </button>
                  <div className="_social_registration_content_bottom_txt _mar_b40">
                    {' '}
                    <span>Or</span>
                  </div>
                  <form className="_social_registration_form" onSubmit={handleSubmit}>
                    <div className="row">
                      <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                        <div className="_social_registration_form_input _mar_b14">
                          <label className="_social_registration_label _mar_b8">First Name</label>
                          <input
                            type="text"
                            name="firstName"
                            value={form.firstName}
                            onChange={onChange}
                            className="form-control _social_registration_input"
                          />
                        </div>
                      </div>
                      <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                        <div className="_social_registration_form_input _mar_b14">
                          <label className="_social_registration_label _mar_b8">Last Name</label>
                          <input
                            type="text"
                            name="lastName"
                            value={form.lastName}
                            onChange={onChange}
                            className="form-control _social_registration_input"
                          />
                        </div>
                      </div>
                      <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                        <div className="_social_registration_form_input _mar_b14">
                          <label className="_social_registration_label _mar_b8">Email</label>
                          <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={onChange}
                            className="form-control _social_registration_input"
                          />
                        </div>
                      </div>
                      <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                        <div className="_social_registration_form_input _mar_b14">
                          <label className="_social_registration_label _mar_b8">Password</label>
                          <input
                            type="password"
                            name="password"
                            value={form.password}
                            onChange={onChange}
                            className="form-control _social_registration_input"
                          />
                        </div>
                      </div>
                      <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                        <div className="_social_registration_form_input _mar_b14">
                          <label className="_social_registration_label _mar_b8">Repeat Password</label>
                          <input
                            type="password"
                            name="repeatPassword"
                            value={form.repeatPassword}
                            onChange={onChange}
                            className="form-control _social_registration_input"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="row">
                      <div className="col-lg-12 col-xl-12 col-md-12 col-sm-12">
                        <div className="form-check _social_registration_form_check">
                          <input
                            className="form-check-input _social_registration_form_check_input"
                            type="radio"
                            name="flexRadioDefault"
                            id="flexRadioDefault2"
                            defaultChecked
                          />
                          <label
                            className="form-check-label _social_registration_form_check_label"
                            htmlFor="flexRadioDefault2"
                          >
                            I agree to terms &amp; conditions
                          </label>
                        </div>
                      </div>
                    </div>
                    {error && (
                      <div className="row">
                        <div className="col-12">
                          <p style={{ color: '#e53e3e', marginTop: 8 }}>{error}</p>
                        </div>
                      </div>
                    )}
                    <div className="row">
                      <div className="col-lg-12 col-md-12 col-xl-12 col-sm-12">
                        <div className="_social_registration_form_btn _mar_t40 _mar_b60">
                          <button type="submit" className="_social_registration_form_btn_link _btn1" disabled={submitting}>
                            {submitting ? 'Creating account…' : 'Register now'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </form>
                  <div className="row">
                    <div className="col-xl-12 col-lg-12 col-md-12 col-sm-12">
                      <div className="_social_registration_bottom_txt">
                        <p className="_social_registration_bottom_txt_para">
                          Already have an account? <a href="#0" onClick={goToLogin}>Login</a>
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
