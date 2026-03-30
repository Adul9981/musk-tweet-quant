import { useState } from 'react';
import { Lock, Mail, CheckCircle, AlertCircle } from 'lucide-react';

interface SubscriptionGateProps {
  children: React.ReactNode;
}

const STORAGE_KEY = 'musk_quant_email_verified';

export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const [isVerified] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });
  const [showModal, setShowModal] = useState(!isVerified);
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = () => {
    if (!email.trim()) {
      setError('请输入邮箱地址');
      return;
    }
    if (!email.includes('@')) {
      setError('请输入有效的邮箱地址');
      return;
    }
    
    setError('');
    setSubmitted(true);
  };

  const handleSkip = () => {
    setShowModal(false);
  };

  if (isVerified || !showModal) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none select-none opacity-50">
        {children}
      </div>
      
      <div className="absolute inset-0 flex items-center justify-center z-50">
        <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl">
          {!submitted ? (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">订阅验证</h3>
                  <p className="text-sm text-gray-400">解锁全部高级功能</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    输入订阅邮箱验证
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500 transition-colors"
                      onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    />
                  </div>
                  {error && (
                    <p className="text-red-400 text-sm mt-2 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" />
                      {error}
                    </p>
                  )}
                </div>
                
                <button
                  onClick={handleVerify}
                  className="w-full py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 font-bold rounded-xl hover:from-yellow-300 hover:to-orange-400 transition-all"
                >
                  验证订阅
                </button>
                
                <div className="text-center">
                  <button
                    onClick={handleSkip}
                    className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
                  >
                    先看看（部分功能受限）
                  </button>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-gray-800/50 rounded-xl border border-gray-700/50">
                <p className="text-xs text-gray-400">
                  <span className="text-yellow-400 font-medium">订阅流程：</span>
                  1. 点击订阅按钮 → 2. 完成 Polar.sh 支付 → 
                  3. 支付成功后联系管理员开通 → 4. 输入邮箱验证
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">邮箱已记录</h3>
                <p className="text-gray-400 text-sm mb-4">
                  已记录您的邮箱：<span className="text-white font-medium">{email}</span>
                </p>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-left">
                  <p className="text-amber-400 font-medium text-sm mb-2">下一步操作：</p>
                  <ol className="text-sm text-gray-400 space-y-1 list-decimal list-inside">
                    <li>完成 Polar.sh 订阅支付</li>
                    <li>联系管理员开通权限</li>
                    <li>管理员确认后再次验证</li>
                  </ol>
                </div>
                <div className="mt-4 text-xs text-gray-500">
                  联系方式：联系管理员并说明您的订阅邮箱
                </div>
                <button
                  onClick={() => {
                    setSubmitted(false);
                    setEmail('');
                  }}
                  className="mt-4 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  使用其他邮箱
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function useSubscriptionVerified() {
  const [isVerified] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });
  return isVerified;
}
