import { useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigErrors, supabaseReady } from './lib/supabase';
import metroLogo from './metroimg_fichiers/logo-metro.png';

const departments = ['Caisse', 'Epicerie', 'Boulangerie', 'Boucherie', 'Direction', 'Autre'];
const typeAvisList = ['Probleme', "Idee d'amelioration", 'Suggestion', 'Urgent'];
const statusList = ['Nouveau', 'En cours', 'Resolu'];
const priorityList = ['Basse', 'Moyenne', 'Haute', 'Urgente'];

function getMostActiveDepartment(avis) {
  if (!avis.length) return '-';
  const counts = avis.reduce((acc, item) => {
    acc[item.departement] = (acc[item.departement] || 0) + 1;
    return acc;
  }, {});
  let maxDep = '-';
  let maxCount = -1;
  Object.entries(counts).forEach(([dep, count]) => {
    if (count > maxCount) {
      maxDep = dep;
      maxCount = count;
    }
  });
  return maxDep;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(value));
}

function formatDateOnly(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function toFriendlyError(error, fallback) {
  const message = error?.message || '';
  const code = error?.code || '';
  if (code === 'invalid_credentials' || message.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect.';
  if (message.includes('relation "public.avis" does not exist')) return 'Table avis manquante. Reexecute supabase/schema.sql.';
  if (message.includes('relation "public.directeur_commentaires" does not exist')) return 'Table directeur_commentaires manquante. Reexecute supabase/schema.sql.';
  if (message.includes('relation "public.audit_logs" does not exist')) return 'Table audit_logs manquante. Reexecute supabase/schema.sql.';
  if (message.includes('row-level security policy')) return 'Erreur RLS. Reexecute supabase/schema.sql.';
  if (message.includes('Failed to fetch')) return 'Impossible de joindre Supabase. Verifie internet/URL/cle API.';
  return message || fallback;
}

export default function App() {
  const [view, setView] = useState('employe');
  const [session, setSession] = useState(null);
  const [avis, setAvis] = useState([]);
  const [commentsByAvis, setCommentsByAvis] = useState({});
  const [editById, setEditById] = useState({});

  const [loadingAvis, setLoadingAvis] = useState(false);
  const [savingAvisId, setSavingAvisId] = useState('');
  const [deleteLoadingId, setDeleteLoadingId] = useState('');
  const [commentLoadingId, setCommentLoadingId] = useState('');

  const [submitSuccess, setSubmitSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [directeurError, setDirecteurError] = useState('');
  const [directeurSuccess, setDirecteurSuccess] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [filterDep, setFilterDep] = useState('Tous');
  const [filterStatus, setFilterStatus] = useState('Tous');
  const [filterPriority, setFilterPriority] = useState('Tous');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [formEmploye, setFormEmploye] = useState({
    nom: '', prenom: '', departement: '', type_avis: '', priorite: 'Moyenne', message: '', is_anonyme: false
  });

  const [commentDrafts, setCommentDrafts] = useState({});
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });

  useEffect(() => {
    if (!supabaseReady) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => setSession(currentSession ?? null));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (view !== 'directeur' || !session) return;
    loadDirectorData();
  }, [view, session]);

  async function loadDirectorData() {
    const rows = await loadAvis();
    await loadComments(rows);
  }

  async function loadAvis() {
    if (!supabaseReady || !session) return [];
    setLoadingAvis(true);
    setDirecteurError('');

    const { data, error } = await supabase
      .from('avis')
      .select('id, nom, prenom, departement, type_avis, priorite, statut, assigne_a, date_limite, is_anonyme, message, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      setDirecteurError(toFriendlyError(error, 'Impossible de charger les avis.'));
      setLoadingAvis(false);
      return [];
    }

    const rows = data ?? [];
    setAvis(rows);
    setEditById(rows.reduce((acc, item) => {
      acc[item.id] = {
        statut: item.statut,
        priorite: item.priorite,
        assigne_a: item.assigne_a ?? '',
        date_limite: item.date_limite ?? ''
      };
      return acc;
    }, {}));
    setLoadingAvis(false);
    return rows;
  }

  async function loadComments(rows) {
    if (!supabaseReady || !session) return;
    const ids = (rows ?? []).map((item) => item.id);
    if (!ids.length) {
      setCommentsByAvis({});
      return;
    }

    const { data, error } = await supabase
      .from('directeur_commentaires')
      .select('id, avis_id, auteur_email, contenu, created_at')
      .in('avis_id', ids)
      .order('created_at', { ascending: false });

    if (error) {
      setDirecteurError((prev) => prev || toFriendlyError(error, 'Impossible de charger les commentaires.'));
      return;
    }

    const grouped = (data ?? []).reduce((acc, item) => {
      if (!acc[item.avis_id]) acc[item.avis_id] = [];
      acc[item.avis_id].push(item);
      return acc;
    }, {});

    setCommentsByAvis(grouped);
  }

  async function submitAvis(event) {
    event.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!supabaseReady) {
      setSubmitError('Configuration Supabase manquante (.env).');
      return;
    }

    const isAnonyme = formEmploye.is_anonyme;
    const payload = {
      nom: isAnonyme ? 'Anonyme' : formEmploye.nom.trim(),
      prenom: isAnonyme ? 'Employe' : formEmploye.prenom.trim(),
      departement: formEmploye.departement,
      type_avis: formEmploye.type_avis,
      priorite: formEmploye.priorite,
      statut: 'Nouveau',
      message: formEmploye.message.trim(),
      is_anonyme: isAnonyme
    };

    if (!payload.nom || !payload.prenom || !payload.departement || !payload.type_avis || !payload.priorite || !payload.message) {
      setSubmitError('Tous les champs sont obligatoires (sauf nom/prenom en anonyme).');
      return;
    }

    const { error } = await supabase.from('avis').insert(payload);
    if (error) {
      setSubmitError(toFriendlyError(error, 'Impossible d envoyer l avis.'));
      return;
    }

    setFormEmploye({ nom: '', prenom: '', departement: '', type_avis: '', priorite: 'Moyenne', message: '', is_anonyme: false });
    setSubmitSuccess('Avis envoye avec succes.');
  }

  async function loginDirecteur(event) {
    event.preventDefault();
    setLoginError('');
    setLoginLoading(true);

    if (!supabaseReady) {
      setLoginError('Configuration Supabase manquante (.env).');
      setLoginLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: loginForm.email.trim(),
      password: loginForm.password
    });

    if (error) {
      setLoginError(toFriendlyError(error, 'Connexion impossible.'));
      setLoginLoading(false);
      return;
    }

    setLoginForm({ email: '', password: '' });
    setLoginLoading(false);
  }

  async function logoutDirecteur() {
    if (!supabaseReady) return;
    await supabase.auth.signOut();
    setAvis([]);
    setCommentsByAvis({});
    setEditById({});
    setDirecteurError('');
    setDirecteurSuccess('');
    setView('employe');
  }

  function updateEditDraft(id, field, value) {
    setEditById((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function saveAvisChanges(id) {
    if (!supabaseReady || !session || !id) return;
    const draft = editById[id];
    if (!draft) return;

    const payload = {
      statut: draft.statut,
      priorite: draft.priorite,
      assigne_a: draft.assigne_a ? draft.assigne_a.trim() : null,
      date_limite: draft.date_limite || null
    };

    setDirecteurError('');
    setDirecteurSuccess('');
    setSavingAvisId(id);

    const { error } = await supabase.from('avis').update(payload).eq('id', id);
    if (error) {
      setDirecteurError(toFriendlyError(error, 'Impossible de mettre a jour cet avis.'));
      setSavingAvisId('');
      return;
    }

    setAvis((prev) => prev.map((item) => (item.id === id ? { ...item, ...payload } : item)));
    setDirecteurSuccess('Avis mis a jour.');
    setSavingAvisId('');
  }

  async function deleteAvis(item) {
    if (!supabaseReady || !session || !item?.id) return;
    if (!window.confirm('Supprimer cet avis ?')) return;

    setDirecteurError('');
    setDirecteurSuccess('');
    setDeleteLoadingId(item.id);

    const { error } = await supabase.from('avis').delete().eq('id', item.id);
    if (error) {
      setDirecteurError(toFriendlyError(error, 'Impossible de supprimer cet avis.'));
      setDeleteLoadingId('');
      return;
    }

    setAvis((prev) => prev.filter((row) => row.id !== item.id));
    setCommentsByAvis((prev) => {
      const copy = { ...prev };
      delete copy[item.id];
      return copy;
    });
    setDeleteLoadingId('');
    setDirecteurSuccess('Message supprime.');
  }

  async function addComment(avisId) {
    if (!supabaseReady || !session || !avisId) return;
    const text = (commentDrafts[avisId] || '').trim();
    if (!text) return;

    setDirecteurError('');
    setDirecteurSuccess('');
    setCommentLoadingId(avisId);

    const { data, error } = await supabase
      .from('directeur_commentaires')
      .insert({
        avis_id: avisId,
        auteur_email: session.user?.email || 'directeur@local',
        contenu: text
      })
      .select('id, avis_id, auteur_email, contenu, created_at')
      .single();

    if (error) {
      setDirecteurError(toFriendlyError(error, 'Impossible d ajouter le commentaire.'));
      setCommentLoadingId('');
      return;
    }

    setCommentsByAvis((prev) => ({ ...prev, [avisId]: [data, ...(prev[avisId] || [])] }));
    setCommentDrafts((prev) => ({ ...prev, [avisId]: '' }));
    setCommentLoadingId('');
    setDirecteurSuccess('Commentaire ajoute.');
  }

  function printAvisAsPdf() {
    window.print();
  }

  const filteredAvis = useMemo(() => {
    const text = searchTerm.trim().toLowerCase();

    return avis.filter((item) => {
      if (filterDep !== 'Tous' && item.departement !== filterDep) return false;
      if (filterStatus !== 'Tous' && item.statut !== filterStatus) return false;
      if (filterPriority !== 'Tous' && item.priorite !== filterPriority) return false;

      if (dateFrom) {
        if (new Date(item.created_at) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(item.created_at) > to) return false;
      }

      if (!text) return true;

      const haystack = [
        item.nom, item.prenom, item.departement, item.type_avis, item.priorite, item.statut, item.message, item.assigne_a
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(text);
    });
  }, [avis, filterDep, filterStatus, filterPriority, searchTerm, dateFrom, dateTo]);

  const totalAvis = avis.length;
  const urgentAvis = avis.filter((item) => item.type_avis === 'Urgent' || item.priorite === 'Urgente').length;
  const openAvis = avis.filter((item) => item.statut !== 'Resolu').length;
  const mostActiveDep = getMostActiveDepartment(avis);

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-one" aria-hidden="true" />
      <div className="bg-orb bg-orb-two" aria-hidden="true" />

      <header className="brand-hero">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <img src={metroLogo} alt="Metro" className="h-10 w-auto drop-shadow-[0_8px_20px_rgba(0,0,0,0.25)]" />
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-red-100/85">Portail interne</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">Avis Employes</h1>
          <p className="mt-2 max-w-2xl text-sm text-red-50/90 sm:text-base">
            Centralise les retours terrain, suit les actions et prepare des rapports clairs pour la direction.
          </p>
        </div>
      </header>

      <main className="app-main mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {!supabaseReady && (
          <div className="notice notice-warn">
            <p className="font-semibold">Configuration Supabase invalide dans .env</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {supabaseConfigErrors.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              Variables attendues: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (ou VITE_SUPABASE_PUBLISHABLE_KEY).
            </p>
          </div>
        )}

        <section className="panel panel-soft print-hidden">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button className={`tab-btn ${view === 'employe' ? 'tab-btn-active' : ''}`} onClick={() => setView('employe')} type="button">Espace Employe</button>
            <button className={`tab-btn ${view === 'directeur' ? 'tab-btn-active' : ''}`} onClick={() => setView('directeur')} type="button">Espace Directeur</button>
          </div>
        </section>

        {view === 'employe' && (
          <section className="panel">
            <h2 className="section-title">Formulaire d'avis employe</h2>

            <form className="mt-6 space-y-4" onSubmit={submitAvis}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={formEmploye.is_anonyme}
                    onChange={(e) => setFormEmploye((prev) => ({ ...prev, is_anonyme: e.target.checked }))}
                  />
                  Envoyer en mode anonyme
                </label>
              </div>

              {!formEmploye.is_anonyme && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="form-label" htmlFor="nom">Nom</label>
                    <input id="nom" className="input-modern" value={formEmploye.nom} onChange={(e) => setFormEmploye((prev) => ({ ...prev, nom: e.target.value }))} required={!formEmploye.is_anonyme} />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="prenom">Prenom</label>
                    <input id="prenom" className="input-modern" value={formEmploye.prenom} onChange={(e) => setFormEmploye((prev) => ({ ...prev, prenom: e.target.value }))} required={!formEmploye.is_anonyme} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="form-label" htmlFor="departement">Departement</label>
                  <select id="departement" className="input-modern" value={formEmploye.departement} onChange={(e) => setFormEmploye((prev) => ({ ...prev, departement: e.target.value }))} required>
                    <option value="">Choisir un departement</option>
                    {departments.map((dep) => (<option key={dep} value={dep}>{dep}</option>))}
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="type_avis">Type d'avis</label>
                  <select id="type_avis" className="input-modern" value={formEmploye.type_avis} onChange={(e) => setFormEmploye((prev) => ({ ...prev, type_avis: e.target.value }))} required>
                    <option value="">Choisir le type</option>
                    {typeAvisList.map((item) => (<option key={item} value={item}>{item}</option>))}
                  </select>
                </div>
                <div>
                  <label className="form-label" htmlFor="priorite">Priorite</label>
                  <select id="priorite" className="input-modern" value={formEmploye.priorite} onChange={(e) => setFormEmploye((prev) => ({ ...prev, priorite: e.target.value }))} required>
                    {priorityList.map((item) => (<option key={item} value={item}>{item}</option>))}
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label" htmlFor="message">Avis</label>
                <textarea id="message" rows="6" className="input-modern resize-y" value={formEmploye.message} onChange={(e) => setFormEmploye((prev) => ({ ...prev, message: e.target.value }))} required />
              </div>

              {submitError && <p className="text-sm font-semibold text-red-700">{submitError}</p>}
              {submitSuccess && <p className="text-sm font-semibold text-emerald-700">{submitSuccess}</p>}

              <button className="action-btn action-primary w-full" type="submit">Envoyer l'avis</button>
            </form>
          </section>
        )}

        {view === 'directeur' && !session && (
          <section className="panel max-w-xl">
            <h2 className="section-title">Connexion Directeur</h2>
            <form className="mt-5 space-y-4" onSubmit={loginDirecteur}>
              <div>
                <label className="form-label" htmlFor="email">Email</label>
                <input id="email" type="email" className="input-modern" value={loginForm.email} onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))} required />
              </div>
              <div>
                <label className="form-label" htmlFor="password">Mot de passe</label>
                <input id="password" type="password" className="input-modern" value={loginForm.password} onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))} required />
              </div>
              {loginError && <p className="text-sm font-semibold text-red-700">{loginError}</p>}
              <button className="action-btn action-primary w-full disabled:opacity-70" type="submit" disabled={loginLoading}>{loginLoading ? 'Connexion...' : 'Se connecter'}</button>
            </form>
          </section>
        )}

        {view === 'directeur' && session && (
          <section className="space-y-5">
            <div className="panel panel-soft print-hidden flex flex-wrap justify-end gap-2">
              <button type="button" className="action-btn action-muted" onClick={printAvisAsPdf}>Imprimer PDF</button>
              <button type="button" className="action-btn action-muted" onClick={loadDirectorData}>Actualiser</button>
              <button type="button" className="action-btn action-muted" onClick={logoutDirecteur}>Se deconnecter</button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="metric-card"><p className="metric-label">Total avis</p><p className="metric-value">{totalAvis}</p></div>
              <div className="metric-card"><p className="metric-label">Avis urgents</p><p className="metric-value text-red-700">{urgentAvis}</p></div>
              <div className="metric-card"><p className="metric-label">Avis ouverts</p><p className="metric-value">{openAvis}</p></div>
              <div className="metric-card"><p className="metric-label">Departement actif</p><p className="mt-2 text-2xl font-black text-slate-900">{mostActiveDep}</p></div>
            </div>

            <div className="panel panel-soft print-hidden space-y-4">
              <h2 className="section-title">Filtres et recherche</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                <input className="input-modern md:col-span-2" placeholder="Recherche (nom, message, type...)" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <select className="input-modern" value={filterDep} onChange={(e) => setFilterDep(e.target.value)}>
                  <option value="Tous">Tous dep.</option>
                  {departments.map((dep) => (<option key={dep} value={dep}>{dep}</option>))}
                </select>
                <select className="input-modern" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="Tous">Tous statuts</option>
                  {statusList.map((item) => (<option key={item} value={item}>{item}</option>))}
                </select>
                <select className="input-modern" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                  <option value="Tous">Toutes priorites</option>
                  {priorityList.map((item) => (<option key={item} value={item}>{item}</option>))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="form-label" htmlFor="dateFrom">Du</label>
                  <input id="dateFrom" type="date" className="input-modern" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="form-label" htmlFor="dateTo">Au</label>
                  <input id="dateTo" type="date" className="input-modern" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    className="action-btn action-muted w-full"
                    onClick={() => {
                      setFilterDep('Tous');
                      setFilterStatus('Tous');
                      setFilterPriority('Tous');
                      setSearchTerm('');
                      setDateFrom('');
                      setDateTo('');
                    }}
                  >
                    Reinitialiser filtres
                  </button>
                </div>
              </div>
            </div>

            {directeurError && <div className="notice notice-danger">{directeurError}</div>}
            {directeurSuccess && <div className="notice notice-success">{directeurSuccess}</div>}

            {loadingAvis ? (
              <div className="panel text-center text-slate-500">Chargement...</div>
            ) : filteredAvis.length === 0 ? (
              <div className="panel text-center text-slate-500">Aucun avis.</div>
            ) : (
              <div className="space-y-4">
                {filteredAvis.map((item) => {
                  const draft = editById[item.id] || {
                    statut: item.statut,
                    priorite: item.priorite,
                    assigne_a: item.assigne_a || '',
                    date_limite: item.date_limite || ''
                  };

                  return (
                    <article key={item.id} className={`panel panel-tight ${item.priorite === 'Urgente' ? 'urgent-ring' : ''}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-black text-slate-900">{item.prenom} {item.nom}</h3>
                          <p className="mt-1 text-sm font-medium text-slate-500">{item.departement} | {item.type_avis} | {formatDate(item.created_at)}</p>
                          {item.is_anonyme && <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">Anonyme</span>}
                        </div>

                        <div className="print-hidden flex items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.priorite === 'Urgente' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>{item.priorite}</span>
                          <button
                            type="button"
                            className="action-btn action-danger px-3 py-1.5 text-xs disabled:opacity-60"
                            onClick={() => deleteAvis(item)}
                            disabled={deleteLoadingId === item.id}
                          >
                            {deleteLoadingId === item.id ? 'Suppression...' : 'Supprimer'}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Message</p>
                        <p className="mt-1 text-base leading-relaxed text-slate-800">{item.message}</p>
                      </div>

                      <div className="print-hidden mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="form-label">Statut</label>
                          <select className="input-modern" value={draft.statut} onChange={(e) => updateEditDraft(item.id, 'statut', e.target.value)}>
                            {statusList.map((option) => (<option key={option} value={option}>{option}</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="form-label">Priorite</label>
                          <select className="input-modern" value={draft.priorite} onChange={(e) => updateEditDraft(item.id, 'priorite', e.target.value)}>
                            {priorityList.map((option) => (<option key={option} value={option}>{option}</option>))}
                          </select>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-500">Statut: {item.statut}</p>
                        <button type="button" className="action-btn action-primary print-hidden" onClick={() => saveAvisChanges(item.id)} disabled={savingAvisId === item.id}>
                          {savingAvisId === item.id ? 'Enregistrement...' : 'Enregistrer modifications'}
                        </button>
                      </div>

                      <div className="print-hidden mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-sm font-bold text-slate-800">Commentaires internes</p>
                        <div className="mt-2 space-y-2">
                          {(commentsByAvis[item.id] || []).length === 0 ? (
                            <p className="text-xs text-slate-500">Aucun commentaire.</p>
                          ) : (
                            (commentsByAvis[item.id] || []).map((comment) => (
                              <div key={comment.id} className="rounded-lg border border-slate-200 bg-white p-2">
                                <p className="text-xs font-semibold text-slate-600">{comment.auteur_email} | {formatDate(comment.created_at)}</p>
                                <p className="mt-1 text-sm text-slate-700">{comment.contenu}</p>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input className="input-modern" placeholder="Ajouter un commentaire interne..." value={commentDrafts[item.id] || ''} onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                          <button type="button" className="action-btn action-muted" onClick={() => addComment(item.id)} disabled={commentLoadingId === item.id}>
                            {commentLoadingId === item.id ? 'Ajout...' : 'Ajouter'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
