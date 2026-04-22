"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CircleDollarSign,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MAX_POINTS = 160;
const APP_NAME = "Energia IoT Monitor";
const APP_TITLE = "Painel de Consumo em Tempo Real";
const CONSUMPTION_WINDOW_MINUTES = 15;

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 3,
});

const throttle = <Args extends unknown[]>(
  callback: (...args: Args) => void,
  limit: number
) => {
  let waiting = false;

  return (...args: Args) => {
    if (waiting) return;
    callback(...args);
    waiting = true;
    window.setTimeout(() => {
      waiting = false;
    }, limit);
  };
};

type SensorData = {
  timestamp: number | null;
  voltage: number;
  current: number;
  power: number;
};

type AuthResponse = {
  access_token?: string;
  token_type?: string;
};

type ConsumptionRecord = {
  tariff_type: string;
  rate_brl_per_kwh: number;
  consumption_kwh: number;
  estimated_cost_brl: number;
};

type ConsumptionPayload = {
  data: ConsumptionRecord[];
  total_kwh: number;
  estimated_cost_brl: number;
  sample_count: number;
  since_minutes: number | null;
};

type ConnectionState = "connecting" | "online" | "offline";

const getApiBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  return `${window.location.protocol}//${window.location.host}/api`;
};

const getWsUrl = () => {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws/stream`;
};

const getTariffLabel = () => {
  const hour = new Date().getHours();
  return hour >= 18 && hour < 21 ? "Ponta" : "Normal";
};

export default function Home() {
  const [dataList, setDataList] = useState<SensorData[]>([]);
  const [latestData, setLatestData] = useState<SensorData | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [token, setToken] = useState<string | null>(null);
  const [consumption, setConsumption] = useState<ConsumptionPayload>({
    data: [],
    total_kwh: 0,
    estimated_cost_brl: 0,
    sample_count: 0,
    since_minutes: CONSUMPTION_WINDOW_MINUTES,
  });

  const pushSample = useMemo(
    () =>
      throttle((sample: SensorData) => {
        setDataList((previous) => [...previous, sample].slice(-MAX_POINTS));
        setLatestData(sample);
      }, 250),
    []
  );

  useEffect(() => {
    let websocket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closedByComponent = false;

    const connect = () => {
      setConnectionState("connecting");
      websocket = new WebSocket(getWsUrl());

      websocket.onopen = () => setConnectionState("online");
      websocket.onmessage = (event) => {
        try {
          pushSample(JSON.parse(event.data) as SensorData);
        } catch (error) {
          console.error("Invalid realtime payload", error);
        }
      };
      websocket.onerror = () => websocket?.close();
      websocket.onclose = () => {
        if (closedByComponent) return;
        setConnectionState("offline");
        reconnectTimer = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return () => {
      closedByComponent = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      websocket?.close();
    };
  }, [pushSample]);

  useEffect(() => {
    const loadInitialReadings = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/readings?limit=${MAX_POINTS}`);
        const payload = (await response.json()) as { data: SensorData[] };
        setDataList(payload.data ?? []);
        setLatestData(payload.data?.at(-1) ?? null);
      } catch (error) {
        console.error("Could not load recent readings", error);
      }
    };

    void loadInitialReadings();
  }, []);

  useEffect(() => {
    const login = async () => {
      const formData = new URLSearchParams();
      formData.append("username", "admin");
      formData.append("password", "admin");

      try {
        const response = await fetch(`${getApiBaseUrl()}/auth/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        });
        const payload = (await response.json()) as AuthResponse;
        if (payload.access_token) setToken(payload.access_token);
      } catch (error) {
        console.error("Authentication failed", error);
      }
    };

    void login();
  }, []);

  const fetchConsumption = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/consumption?since_minutes=${CONSUMPTION_WINDOW_MINUTES}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const payload = (await response.json()) as ConsumptionPayload;
      setConsumption({
        data: payload.data ?? [],
        total_kwh: Number(payload.total_kwh ?? 0),
        estimated_cost_brl: Number(payload.estimated_cost_brl ?? 0),
        sample_count: Number(payload.sample_count ?? 0),
        since_minutes: payload.since_minutes ?? CONSUMPTION_WINDOW_MINUTES,
      });
    } catch (error) {
      console.error("Could not load consumption", error);
    }
  }, [token]);

  useEffect(() => {
    void fetchConsumption();
    const interval = window.setInterval(fetchConsumption, 5000);
    return () => window.clearInterval(interval);
  }, [fetchConsumption]);

  const chartData = useMemo(
    () =>
      dataList.map((sample) => ({
        ...sample,
        timeLabel: sample.timestamp
          ? new Date(sample.timestamp).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : "",
      })),
    [dataList]
  );

  const currentTariff = getTariffLabel();
  const latestTimestamp = latestData?.timestamp
    ? new Date(latestData.timestamp).toLocaleTimeString("pt-BR")
    : "--";
  const normalConsumption =
    consumption.data.find((item) => item.tariff_type === "Normal")?.consumption_kwh ?? 0;
  const peakConsumption =
    consumption.data.find((item) => item.tariff_type === "Ponta")?.consumption_kwh ?? 0;
  const statusTone =
    connectionState === "online"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
      : connectionState === "connecting"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
        : "border-red-500/40 bg-red-500/10 text-red-100";
  const StatusIcon = connectionState === "online" ? Wifi : WifiOff;

  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
              {APP_NAME}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-white sm:text-3xl">
              {APP_TITLE}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${statusTone}`}>
              <StatusIcon className="h-4 w-4" />
              <span className="capitalize">{connectionState}</span>
            </div>
            <button
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500 hover:bg-slate-800"
              onClick={() => void fetchConsumption()}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-400">Potência ativa</p>
              <Zap className="h-5 w-5 text-emerald-300" />
            </div>
            <p className="mt-4 text-3xl font-semibold text-white">
              {latestData ? latestData.power.toFixed(0) : "--"}
              <span className="ml-2 text-base font-medium text-slate-400">W</span>
            </p>
            <p className="mt-3 text-xs text-slate-500">Última leitura: {latestTimestamp}</p>
          </article>

          <article className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-400">Tensão</p>
              <Gauge className="h-5 w-5 text-sky-300" />
            </div>
            <p className="mt-4 text-3xl font-semibold text-white">
              {latestData ? latestData.voltage.toFixed(1) : "--"}
              <span className="ml-2 text-base font-medium text-slate-400">V</span>
            </p>
            <p className="mt-3 text-xs text-slate-500">Tarifa atual: {currentTariff}</p>
          </article>

          <article className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-400">Corrente</p>
              <Activity className="h-5 w-5 text-amber-300" />
            </div>
            <p className="mt-4 text-3xl font-semibold text-white">
              {latestData ? latestData.current.toFixed(2) : "--"}
              <span className="ml-2 text-base font-medium text-slate-400">A</span>
            </p>
            <p className="mt-3 text-xs text-slate-500">Amostras no gráfico: {chartData.length}</p>
          </article>

          <article className="rounded-lg border border-slate-800 bg-slate-950 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-400">Custo estimado</p>
              <CircleDollarSign className="h-5 w-5 text-lime-300" />
            </div>
            <p className="mt-4 text-3xl font-semibold text-white">
              {moneyFormatter.format(consumption.estimated_cost_brl)}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              {numberFormatter.format(consumption.total_kwh)} kWh nos últimos {CONSUMPTION_WINDOW_MINUTES} min
            </p>
          </article>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
          <article className="min-h-[420px] rounded-lg border border-slate-800 bg-slate-950 p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Potência ativa</h2>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <ShieldCheck className="h-4 w-4 text-cyan-300" />
                Token OK
              </div>
            </div>

            <div className="h-[340px] w-full">
              {chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-800 text-sm text-slate-500">
                  Aguardando leituras do sensor
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 12, right: 20, bottom: 8, left: 0 }}>
                    <CartesianGrid stroke="#1f2937" strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="timeLabel"
                      minTickGap={28}
                      stroke="#64748b"
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={["dataMin - 150", "dataMax + 150"]}
                      stroke="#64748b"
                      tick={{ fill: "#94a3b8", fontSize: 12 }}
                      tickFormatter={(value) => `${Number(value).toFixed(0)} W`}
                      tickLine={false}
                      width={72}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #334155",
                        borderRadius: 8,
                        color: "#e2e8f0",
                      }}
                      formatter={(value) => [`${Number(value).toFixed(1)} W`, "Potência"]}
                      labelStyle={{ color: "#cbd5e1" }}
                    />
                    <Line
                      dataKey="power"
                      dot={false}
                      isAnimationActive={false}
                      stroke="#14b8a6"
                      strokeWidth={2}
                      type="monotone"
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </article>

          <aside className="flex flex-col gap-4">
            <article className="rounded-lg border border-slate-800 bg-slate-950 p-5">
              <h2 className="text-lg font-semibold text-white">Tarifas</h2>
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
                  <div>
                    <p className="text-sm font-medium text-slate-300">Normal</p>
                    <p className="mt-1 text-xs text-slate-500">R$ 0,50/kWh</p>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {numberFormatter.format(normalConsumption)} kWh
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-300">Ponta</p>
                    <p className="mt-1 text-xs text-slate-500">R$ 0,90/kWh</p>
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {numberFormatter.format(peakConsumption)} kWh
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-lg border border-slate-800 bg-slate-950 p-5">
              <h2 className="text-lg font-semibold text-white">Serviços</h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <dt className="text-slate-500">Sensor</dt>
                <dd className="text-right text-slate-200">Ativo</dd>
                <dt className="text-slate-500">Backend</dt>
                <dd className="text-right text-slate-200">Ativo</dd>
                <dt className="text-slate-500">Banco</dt>
                <dd className="text-right text-slate-200">Ativo</dd>
                <dt className="text-slate-500">Proxy</dt>
                <dd className="text-right text-slate-200">Ativo</dd>
              </dl>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
