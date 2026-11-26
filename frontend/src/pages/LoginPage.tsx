import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';

interface LoginFormValues {
  email: string;
  password: string;
  rememberMe: boolean;
}

export const LoginPage: React.FC = () => {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  });

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (values: LoginFormValues) => {
    setAuthError(null);
    try {
      await login(values.email, values.password, values.rememberMe);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Invalid email or password. Please verify your credentials.';
      setAuthError(Array.isArray(msg) ? msg.join(', ') : msg);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#101010] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="sr-card p-6 sm:p-8">
          <div className="mb-6 flex flex-col items-start gap-2">
            <BrandLogo />
            <p className="mt-2 text-sm text-[#A3A3A3]">
              Sign in to access real-time room telemetry, security alerts, and remote door lock control.
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-[#EF4444]/40 bg-[#EF4444]/15 p-3 text-xs text-[#FCA5A5]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#EF4444]" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-[#F5F5F5]">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="admin@smartroom.local"
                className="sr-input"
                {...register('email', {
                  required: 'Email address is required',
                  pattern: {
                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                    message: 'Enter a valid email address',
                  },
                })}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-[#EF4444]">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-[#F5F5F5]">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="sr-input pr-10"
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 6,
                      message: 'Password must be at least 6 characters',
                    },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-[#A3A3A3] hover:text-[#F5F5F5]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-[#EF4444]">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-[#A3A3A3]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[#303030] bg-[#141414] accent-[#FACC15]"
                  {...register('rememberMe')}
                />
                Remember me on this device
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="sr-btn-primary mt-2 w-full"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Sign In to Console
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-[#303030] pt-4 text-xs text-[#A3A3A3]">
            Accounts are seeded securely in the backend database via{' '}
            <code className="rounded bg-[#242424] px-1.5 py-0.5 text-[#FACC15]">npm run seed:admin</code>.
          </div>
        </div>
      </div>
    </div>
  );
};
