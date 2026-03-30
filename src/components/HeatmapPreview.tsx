import { Lock } from 'lucide-react';

interface HeatmapPreviewProps {
  isSubscribed?: boolean;
}

const DEMO_DATA = [
  { hour: 0, count: 2 }, { hour: 1, count: 1 }, { hour: 2, count: 0 }, { hour: 3, count: 1 },
  { hour: 4, count: 3 }, { hour: 5, count: 5 }, { hour: 6, count: 8 }, { hour: 7, count: 12 },
  { hour: 8, count: 15 }, { hour: 9, count: 18 }, { hour: 10, count: 22 }, { hour: 11, count: 19 },
  { hour: 12, count: 14 }, { hour: 13, count: 16 }, { hour: 14, count: 20 }, { hour: 15, count: 18 },
  { hour: 16, count: 12 }, { hour: 17, count: 8 }, { hour: 18, count: 6 }, { hour: 19, count: 4 },
  { hour: 20, count: 5 }, { hour: 21, count: 7 }, { hour: 22, count: 4 }, { hour: 23, count: 2 },
];

const getColorForCount = (count: number): string => {
  if (count === 0) return '#1a1a2e';
  if (count <= 3) return '#f5e6a3';
  if (count <= 7) return '#f5d066';
  if (count <= 12) return '#f5b833';
  if (count <= 18) return '#e69500';
  return '#cc7000';
};

export function HeatmapPreview({ isSubscribed = false }: HeatmapPreviewProps) {
  return (
    <div className="bg-gray-900/80 border border-gray-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500/80"></div>
            <div className="w-3 h-3 rounded-full bg-green-500/80"></div>
          </div>
          <span className="text-sm text-gray-400 ml-2">发推活动热力图</span>
        </div>
        {!isSubscribed && (
          <div className="flex items-center gap-2 text-xs text-yellow-400/80">
            <Lock className="w-3 h-3" />
            <span>订阅解锁完整数据</span>
          </div>
        )}
      </div>
      
      <div className="p-4">
        <div className="flex gap-1 mb-3">
          {['3/26', '3/27', '3/28', '3/29', '3/30'].map((date, i) => (
            <div key={i} className="flex-1 text-center">
              <span className={`text-xs ${i === 4 ? 'text-yellow-400' : 'text-gray-500'}`}>{date}</span>
            </div>
          ))}
        </div>
        
        <div className="relative">
          <div className="grid grid-cols-24 gap-0.5">
            {[0, 1, 2, 3].map(dayRow => (
              DEMO_DATA.map((hourData, hourIdx) => (
                <div
                  key={`${dayRow}-${hourIdx}`}
                  className="w-full aspect-square rounded-sm transition-all"
                  style={{ 
                    backgroundColor: getColorForCount(hourData.count),
                    opacity: isSubscribed ? 1 : dayRow === 4 ? 1 : 0.4
                  }}
                />
              ))
            ))}
          </div>
          
          {!isSubscribed && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/60 backdrop-blur-sm">
              <div className="text-center">
                <Lock className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-sm text-gray-300">订阅后查看完整热力图</p>
                <p className="text-xs text-gray-500 mt-1">包含15天数据 + 详细统计</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-700/50">
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-4 h-4 rounded bg-[#1a1a2e]" title="无"></div>
              <div className="w-4 h-4 rounded bg-[#f5e6a3]" title="1-3"></div>
              <div className="w-4 h-4 rounded bg-[#f5d066]" title="4-7"></div>
              <div className="w-4 h-4 rounded bg-[#f5b833]" title="8-12"></div>
              <div className="w-4 h-4 rounded bg-[#e69500]" title="13-18"></div>
              <div className="w-4 h-4 rounded bg-[#cc7000]" title="19+"></div>
            </div>
            <span className="text-xs text-gray-500">条/小时</span>
          </div>
          <div className="text-xs text-gray-500">
            🕐 北京时间 · 24小时
          </div>
        </div>
      </div>
    </div>
  );
}
