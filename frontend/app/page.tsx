"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";
import throttle from "lodash.throttle";

type SensorData = {
  timestamp: number;
  voltage: number;
  current: number;
  power: number;
};

export default function Home() {
  const [dataList, setDataList] = useState<SensorData[]>([]);
  const [latestData, setLatestData] = useState<SensorData | null>(null);
  
  const throttledUpdate = useMemo(
    () => throttle((newData: SensorData) => {
      setDataList((prev) => {
        const nextData = [...prev, newData];
        if (nextData.length > 50) return nextData.slice(-50); // Mantém os últimos 50 pontos p/ gráfico vivo
        return nextData;
      });
      setLatestData(newData);
    }, 200), // update UI at most once per 200ms para fluidez
    []
  );

  useEffect(() => {
    // Aponta para o ws do proxy no docker local, ou para a API hospedada. O proxy_pass foi corrigido.
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8080/ws/stream";
    let ws: WebSocket;

    try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => console.log("Connected to Realtime Data Stream:", wsUrl);
        
        ws.onmessage = (event) => {
          try {
            const data: SensorData = JSON.parse(event.data);
            throttledUpdate(data);
          } catch (e) {
            console.error("Error parsing ts data", e);
          }
        };
    } catch (err) {
        console.error("WebSocket Connection Failed", err);
    }
    return () => {
      if (ws) ws.close();
      throttledUpdate.cancel();
    };
  }, [throttledUpdate]);

  const [totalCost, setTotalCost] = useState(0);
  const [totalKwh, setTotalKwh] = useState(0);

  const fetchConsumption = useCallback(async () => {
    try {
      const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api";
      const res = await fetch(`${url}/consumption`);
      const payload = await res.json();
      
      let cost = 0;
      let kwh = 0;
      if (payload.data && Array.isArray(payload.data)) {
        payload.data.forEach((d: any) => {
           kwh += Number(d.consumption_kwh);
           if (d.tariff_type === 'Ponta') {
               cost += (Number(d.consumption_kwh) * 0.90);
           } else {
               cost += (Number(d.consumption_kwh) * 0.50);
           }
        });
      }
      setTotalCost(cost);
      setTotalKwh(kwh);
    } catch (e) {
      console.error("Erro consultando rota HTTP", e);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(fetchConsumption, 5000); 
    fetchConsumption();
    return () => clearInterval(id);
  }, [fetchConsumption]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-6 md:p-12 relative overflow-hidden">
      
      {/* Background blobs for pure aesthetics */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />

      <div className="z-10 w-full max-w-7xl items-center justify-between font-display text-sm">
        
        <header className="mb-12 flex flex-col md:flex-row items-center justify-between">
          <div>
            <h1 className="text-5xl font-extrabold mb-2 text-gradient">
              Neural Grid
            </h1>
            <p className="text-gray-400 font-sans text-lg">Monitoramento Energético em Tempo Real</p>
          </div>
          <div className="mt-4 md:mt-0 flex items-center space-x-3 bg-white/5 px-5 py-2.5 rounded-full border border-white/10 glass-panel">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span className="font-semibold tracking-wide text-sm">SISTEMA ONLINE</span>
          </div>
        </header>

        {/* METRICS ROW */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 font-sans">
            <div className="glass-panel p-6 rounded-3xl glow-on-hover relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">⚡</div>
                <h3 className="text-gray-400 font-medium tracking-wider text-xs mb-3 uppercase">Tensão Ativa</h3>
                <p className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300">
                  {latestData ? latestData.voltage.toFixed(1) : '--'} <span className="text-xl">V</span>
                </p>
                <div className="mt-4 text-xs text-blue-300/80">RMS calculado em tempo real</div>
            </div>
            
            <div className="glass-panel p-6 rounded-3xl glow-on-hover relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">🔌</div>
                <h3 className="text-gray-400 font-medium tracking-wider text-xs mb-3 uppercase">Corrente (Carga)</h3>
                <p className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-400">
                  {latestData ? latestData.current.toFixed(2) : '--'} <span className="text-xl">A</span>
                </p>
                <div className="mt-4 text-xs text-purple-300/80">Monitoramento contínuo</div>
            </div>

            <div className="glass-panel p-6 rounded-3xl glow-on-hover border-green-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">🔋</div>
                <h3 className="text-gray-400 font-medium tracking-wider text-xs mb-3 uppercase">Potência Instantânea</h3>
                <p className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-300">
                  {latestData ? latestData.power.toFixed(0) : '--'} <span className="text-xl">W</span>
                </p>
                <div className="mt-4 text-xs text-green-300/80">Atualização em ms</div>
            </div>

            <div className="glass-panel p-6 rounded-3xl glow-on-hover border-yellow-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">💰</div>
                <h3 className="text-gray-400 font-medium tracking-wider text-xs mb-3 uppercase">Consumo Global</h3>
                <p className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-400 to-orange-400">
                  R$ {totalCost.toFixed(2)}
                </p>
                <div className="mt-4 flex justify-between items-center text-xs text-yellow-300/80">
                  <span>Total Kwh:</span>
                  <span className="font-bold">{totalKwh.toFixed(2)}</span>
                </div>
            </div>
        </div>

        {/* CHART SECTION */}
        <div className="glass-panel p-8 rounded-3xl w-full h-[550px] flex flex-col font-sans">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-white font-semibold text-xl tracking-wide font-display">Sinal de Potência Contínua</h3>
                <div className="text-xs px-3 py-1 bg-white/10 rounded-full text-gray-300 backdrop-blur-sm">Streaming via WebSocket</div>
             </div>
             
             <div className="flex-grow min-h-[400px]">
               {dataList.length === 0 ? (
                   <div className="flex h-full items-center justify-center text-gray-500 flex-col space-y-4">
                     <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                     <span>Estabelecendo elo com dispositivos Edge...</span>
                   </div>
               ) : (
               <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={dataList.map((d, i) => ({...d, idx: i}))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="idx" hide={true} />
                      <YAxis stroke="#6b7280" tick={{fill: '#9CA3AF', fontSize: 12}} tickLine={false} axisLine={false} tickFormatter={(val) => `${val} W`} />
                      <Tooltip 
                        contentStyle={{backgroundColor: 'rgba(17, 24, 39, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.3)'}} 
                        itemStyle={{color: '#c084fc', fontWeight: 'bold'}}
                        labelStyle={{display: 'none'}}
                        formatter={(value: number) => [`${value.toFixed(1)} W`, 'Potência Ativa']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="power" 
                        stroke="#c084fc" 
                        strokeWidth={4}
                        fillOpacity={1} 
                        fill="url(#colorPower)" 
                        isAnimationActive={false} 
                        activeDot={{ r: 6, fill: '#fff', stroke: '#c084fc', strokeWidth: 3 }}
                      />
                   </AreaChart>
               </ResponsiveContainer>
               )}
             </div>
        </div>
      </div>
    </main>
  );
}
