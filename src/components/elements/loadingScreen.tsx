'use client';

import { Fira_Code } from 'next/font/google';
import { useEffect, useRef, useState } from 'react';

import type { JSX } from 'react';

import styles from './loading-screen.module.css';


const firaCode = Fira_Code({
  subsets: ['latin'],
  display: 'swap',
  weight: ['300', '400', '500', '700'],
});

const ALERT_TRIGGER_RATE = 0.05;
const BASE_ERROR_CHANCE = 0.3;

type LogType = 'info' | 'success' | 'warning' | 'error';

type BootLogItem = {
  id: number;
  timestamp: string;
  message: string;
  type: LogType;
};

type BaseLogMessage = {
  msg: string;
  type: Extract<LogType, 'info' | 'success'>;
};

const logMessages: BaseLogMessage[] = [
  { msg: 'Initializing kernel...', type: 'info' },
  { msg: 'Loading modules...', type: 'info' },
  { msg: 'Detected CPU: Quantum Core i9-9990K @ 5.00GHz', type: 'info' },
  { msg: 'Memory: 128GB DDR5 RAM OK', type: 'info' },
  { msg: 'Mounting file systems...', type: 'success' },
  { msg: 'Checking disk integrity...', type: 'info' },
  { msg: '/dev/sda1: clean, 512/1024 files, 2048/4096 blocks', type: 'info' },
  { msg: 'Starting network services...', type: 'info' },
  { msg: 'Connected to eth0: 192.168.1.100', type: 'success' },
  { msg: 'Checking security protocols...', type: 'info' },
  { msg: 'Firewall enabled. Rules updated.', type: 'success' },
  { msg: 'Loading user interface...', type: 'info' },
  { msg: 'Starting X server...', type: 'info' },
  { msg: 'Establishing secure connection...', type: 'success' },
  { msg: 'Verifying identity...', type: 'success' },
  { msg: 'Loading portfolio data...', type: 'info' },
  { msg: 'Fetching assets from CDN...', type: 'info' },
  { msg: 'Compiling stylesheets...', type: 'info' },
  { msg: 'Executing scripts...', type: 'info' },
  { msg: 'System ready.', type: 'success' },
  { msg: 'Welcome to Chukyo Terminal\'s website.', type: 'success' },
];


const secureRandom = (): number => {
  const randomValues = new Uint32Array(1);
  crypto.getRandomValues(randomValues);
  return randomValues[0] / 4_294_967_296;
};

const formatTimestamp = (): string => `[ ${(performance.now() / 1000).toFixed(6)} ]`;

const isAprilFirst = (): boolean => {
  const now = new Date();
  return now.getMonth() === 3 && now.getDate() === 1;
};

const isAlertTiming = (logIndex: number): boolean => logIndex > 2 && logIndex < logMessages.length - 2;

const getMessageClassName = (type: LogType): string => {
  switch (type) {
    case 'success': {
      return `${styles.logMessage} ${styles.logSuccess}`;
    }
    case 'info': {
      return `${styles.logMessage} ${styles.logInfo}`;
    }
    case 'warning': {
      return `${styles.logMessage} ${styles.logWarning}`;
    }
    case 'error': {
      return `${styles.logMessage} ${styles.logError}`;
    }
    default: {
      return styles.logMessage;
    }
  }
};


export default function LoadingScreen(): JSX.Element | null {
  const [logs, setLogs] = useState<BootLogItem[]>([]);
  const [showProgress, setShowProgress] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [visible, setVisible] = useState<boolean>(true);

  const nextIdReference = useRef<number>(0);
  const progressValueReference = useRef<number>(0);
  const intervalReference = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutIdsReference = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let cancelled = false;
    let logIndex = 0;
    let hasForcedAprilFirstError = false;
    const todayIsAprilFirst = isAprilFirst();

    const scheduleTimeout = (callback: () => void, delay: number): void => {
      const timeoutId = setTimeout(callback, delay);
      timeoutIdsReference.current.push(timeoutId);
    };

    const clearBootState = (): void => {
      setLogs([]);
      setShowProgress(false);
      setProgress(0);
      progressValueReference.current = 0;
      logIndex = 0;
    };

    const pushLogLine = (message: string, type: LogType): void => {
      nextIdReference.current += 1;
      setLogs((previous) => [
        ...previous,
        {
          id: nextIdReference.current,
          timestamp: formatTimestamp(),
          message,
          type,
        },
      ]);
    };

    const restartAfterError = (): void => {
      scheduleTimeout(() => {
        if (cancelled) {
          return;
        }
        clearBootState();
        addLogLine();
      }, 2000);
    };

    const startProgressBar = (): void => {
      setShowProgress(true);

      if (intervalReference.current) {
        clearInterval(intervalReference.current);
      }

      intervalReference.current = setInterval(() => {
        if (cancelled) {
          return;
        }

        if (progressValueReference.current >= 100) {
          if (intervalReference.current) {
            clearInterval(intervalReference.current);
            intervalReference.current = null;
          }
          scheduleTimeout(() => {
            if (!cancelled) {
              setVisible(false);
            }
          }, 500);
          return;
        }

        progressValueReference.current += secureRandom() * 5;
        if (progressValueReference.current > 100) {
          progressValueReference.current = 100;
        }
        setProgress(progressValueReference.current);
      }, 50);
    };

    const maybeInjectForcedAprilFirstError = (): boolean => {
      if (!todayIsAprilFirst || hasForcedAprilFirstError || !isAlertTiming(logIndex)) {
        return false;
      }

      hasForcedAprilFirstError = true;
      pushLogLine('BOOT ERROR: Kernel panic - not syncing: VFS: Unable to mount root fs', 'error');
      restartAfterError();
      return true;
    };

    const maybeInjectRandomAlert = (): void => {
      if (!isAlertTiming(logIndex) || secureRandom() >= ALERT_TRIGGER_RATE) {
        return;
      }

      const errorChance = todayIsAprilFirst ? Math.min(BASE_ERROR_CHANCE * 2, 1) : BASE_ERROR_CHANCE;
      const isError = secureRandom() < errorChance;
      const alertType: LogType = isError ? 'error' : 'warning';
      const alertMessage = isError
        ? 'CRITICAL ERROR: Kernel panic - not syncing: VFS: Unable to mount root fs'
        : 'WARNING: CPU temperature high';

      pushLogLine(alertMessage, alertType);

      if (isError) {
        restartAfterError();
      }
    };

    const appendNextBootMessage = (): void => {
      if (logIndex >= logMessages.length) {
        return;
      }

      const log = logMessages[logIndex];
      pushLogLine(log.msg, log.type);
      logIndex += 1;

      if (logIndex < logMessages.length) {
        const delay = secureRandom() * 100 + 20;
        scheduleTimeout(() => {
          addLogLine();
        }, delay);
        return;
      }

      scheduleTimeout(() => {
        startProgressBar();
      }, 200);
    };

    const addLogLine = (): void => {
      if (cancelled) {
        return;
      }

      if (maybeInjectForcedAprilFirstError()) {
        return;
      }

      maybeInjectRandomAlert();
      appendNextBootMessage();
    };

    addLogLine();

    return () => {
      cancelled = true;

      if (intervalReference.current) {
        clearInterval(intervalReference.current);
      }

      for (const timeoutId of timeoutIdsReference.current) {
        clearTimeout(timeoutId);
      }
      timeoutIdsReference.current = [];
    };
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div id='loading-screen' className={`${styles.loadingScreen} ${firaCode.className}`}>
      <div className={styles.bootLog}>
        {logs.map((log) => (
          <div key={log.id} className={styles.logLine}>
            <span className={styles.logTimestamp}>{log.timestamp}</span>
            <span className={getMessageClassName(log.type)}>{log.message}</span>
          </div>
        ))}
      </div>

      {showProgress && (
        <div className={styles.progressContainer}>
          <div className={styles.progressBarWrapper}>
            <span className={styles.progressLabel}>Starting...</span>
            <div className={styles.progressBarBg}>
              <div className={styles.progressBarFill} style={{ width: `${progress}%` }} />
            </div>
            <span className={styles.progressPercent}>{`${Math.floor(progress)}%`}</span>
          </div>
        </div>
      )}
    </div>
  );
}
