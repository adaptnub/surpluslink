// Top-level component: loads the state from the API, remembers who you are
// acting as, and picks which view to show.

import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Header from './components/Header.jsx';
import PeopleRail from './components/PeopleRail.jsx';
import DonorView from './components/DonorView.jsx';
import VolunteerView from './components/VolunteerView.jsx';
import Dashboard from './components/Dashboard.jsx';
import Toasts from './components/Toasts.jsx';

const PERSONA_KEY = 'surpluslink:persona';
const REFRESH_MS = 4000; // poll so several tabs or people stay in sync

function savedPersona() {
  try {
    return JSON.parse(localStorage.getItem(PERSONA_KEY)) ?? { kind: 'dashboard' };
  } catch {
    return { kind: 'dashboard' };
  }
}

export default function App() {
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [persona, setPersona] = useState(savedPersona);
  const [toasts, setToasts] = useState([]);

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setLoadError(null);
    } catch (error) {
      setLoadError(error.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    try {
      localStorage.setItem(PERSONA_KEY, JSON.stringify(persona));
    } catch {
      // storage can be blocked; remembering the persona is only a convenience
    }
  }, [persona]);

  const notify = useCallback((toast) => {
    const id = crypto.randomUUID();
    setToasts((list) => [...list, { id, ...toast }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), toast.kind === 'error' ? 8000 : 3500);
  }, []);

  /**
   * Runs one API action and refreshes the state afterwards.
   * Errors show as a toast listing every reason, unless `inline` is set,
   * in which case the caller shows them (forms do this).
   */
  const perform = useCallback(
    async (call, { success, inline = false } = {}) => {
      try {
        const result = await call();
        if (success) notify({ kind: 'success', title: success });
        await refresh();
        return { ok: true, result };
      } catch (error) {
        const reasons = error.reasons?.length ? error.reasons : [];
        if (!inline) notify({ kind: 'error', title: error.message, reasons });
        await refresh();
        return { ok: false, title: error.message, reasons };
      }
    },
    [notify, refresh],
  );

  if (!state) {
    return (
      <div className="splash">
        <img src="/favicon.svg" alt="" width="48" height="48" />
        <p>{loadError ? `Can't reach the API (${loadError}). Is the server running?` : 'Loading SurplusLink…'}</p>
      </div>
    );
  }

  const donor = persona.kind === 'donor' && state.donors.find((d) => d.id === persona.id);
  const volunteer = persona.kind === 'volunteer' && state.volunteers.find((v) => v.id === persona.id);

  return (
    <div className="app">
      <Header now={state.now} perform={perform} />
      <div className="layout">
        <PeopleRail state={state} persona={persona} onPick={setPersona} />
        <main className="main" key={`${persona.kind}-${persona.id ?? ''}`}>
          {donor ? (
            <DonorView donor={donor} state={state} perform={perform} />
          ) : volunteer ? (
            <VolunteerView volunteer={volunteer} state={state} perform={perform} />
          ) : (
            <Dashboard state={state} />
          )}
        </main>
      </div>
      <Toasts toasts={toasts} />
    </div>
  );
}
