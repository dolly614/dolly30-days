'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  Plus,
  UploadCloud,
  DownloadCloud,
  ExternalLink,
  Trash2,
  AlertTriangle,
  LogOut,
  CheckCircle2,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  googleLogout,
} from '@/lib/google-auth';
import { GoogleSignInButton } from '@/components/site/GoogleSignInButton';
import { useUyanixStore } from '@/lib/store';
import { getTopicsForClass } from '@/lib/curriculum';
import { toast } from 'sonner';

interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface SheetTabInfo {
  sheetId: number;
  title: string;
}

interface PendingConfirmAction {
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive?: boolean;
  onConfirm: () => Promise<void>;
}

export function GoogleSheetsPanel() {
  const { leaderboard, payments, teachers, bulkSaveChapters } = useUyanixStore();

  const [needsAuth, setNeedsAuth] = useState(true);
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [files, setFiles] = useState<DriveSpreadsheetFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [sheetTabs, setSheetTabs] = useState<SheetTabInfo[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>('');
  const [sheetRows, setSheetRows] = useState<string[][]>([]);
  const [loading, setLoading] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState(
    'Uyanix 30 Days Challenge — Live Tracker 2026'
  );

  const [newRowStudent, setNewRowStudent] = useState('');
  const [newRowClass, setNewRowClass] = useState('10');
  const [newRowCity, setNewRowCity] = useState('Jaipur');
  const [newRowScore, setNewRowScore] = useState('29/30');

  const [confirmDialog, setConfirmDialog] = useState<PendingConfirmAction | null>(
    null
  );

  const fetchSpreadsheetsList = useCallback(
    async (accessToken: string) => {
      setLoading(true);
      try {
        const res = await fetch('/api/sheets?action=listSpreadsheets', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 401) {
          setNeedsAuth(true);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch sheets');
        const list: DriveSpreadsheetFile[] = data.files || [];
        setFiles(list);
        if (list.length > 0 && !selectedFileId) {
          setSelectedFileId(list[0].id);
        }
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [selectedFileId]
  );

  const fetchSpreadsheetTabs = useCallback(async (spreadsheetId: string) => {
    if (!spreadsheetId) return;
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sheets?action=getSpreadsheetMeta&spreadsheetId=${encodeURIComponent(
          spreadsheetId
        )}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load tabs');
      const tabs: SheetTabInfo[] = data.sheets || [];
      setSheetTabs(tabs);
      if (tabs.length > 0) {
        setSelectedTab(tabs[0].title);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTabValues = useCallback(
    async (spreadsheetId: string, tabTitle: string) => {
      if (!spreadsheetId || !tabTitle) return;
      const token = await getAccessToken();
      if (!token) {
        setNeedsAuth(true);
        return;
      }
      setLoading(true);
      try {
        const range = `${tabTitle}!A1:G50`;
        const res = await fetch(
          `/api/sheets?action=readRange&spreadsheetId=${encodeURIComponent(
            spreadsheetId
          )}&range=${encodeURIComponent(range)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to read sheet values');
        setSheetRows(data.values || []);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setNeedsAuth(false);
        fetchSpreadsheetsList(token);
      },
      () => {
        setGoogleUser(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, [fetchSpreadsheetsList]);

  useEffect(() => {
    if (selectedFileId && !needsAuth) {
      fetchSpreadsheetTabs(selectedFileId);
    }
  }, [selectedFileId, needsAuth, fetchSpreadsheetTabs]);

  useEffect(() => {
    if (selectedFileId && selectedTab && !needsAuth) {
      fetchTabValues(selectedFileId, selectedTab);
    }
  }, [selectedFileId, selectedTab, needsAuth, fetchTabValues]);

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setNeedsAuth(false);
        toast.success(`Connected to Google Sheets as ${result.user.email}! 📊`);
        await fetchSpreadsheetsList(result.accessToken);
      }
    } catch (err) {
      toast.error((err as Error).message || 'Google Sign-In failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    await googleLogout();
    setGoogleUser(null);
    setNeedsAuth(true);
    setFiles([]);
    setSheetRows([]);
    toast.info('Disconnected from Google Workspace');
  };

  const handleCreateMasterSheet = async () => {
    const token = await getAccessToken();
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setLoading(true);
    try {
      const initialLeaderboardValues = [
        ['Rank', 'Student Name', 'Class', 'City', 'Score', 'Prize Status'],
        ...leaderboard.map((s) => [
          `#${s.rank}`,
          s.name,
          `Class ${s.classNum}`,
          s.city,
          `${s.score}/${s.total}`,
          s.prizePaid ? 'Paid' : 'Pending',
        ]),
      ];

      const res = await fetch('/api/sheets', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'createSpreadsheet',
          title: newSheetTitle.trim() || 'Uyanix 30 Days Challenge Tracker',
          values: initialLeaderboardValues,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create sheet');

      toast.success(`Created "${data.title}" in your Google Drive! 🎉`);
      await fetchSpreadsheetsList(token);
      setSelectedFileId(data.spreadsheetId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const promptSyncDataset = (
    datasetType: 'leaderboard' | 'payments' | 'teachers' | 'chapters'
  ) => {
    if (!selectedFileId || !selectedTab) {
      toast.error('Pehle ek Google Spreadsheet aur Sheet Tab select karein!');
      return;
    }

    const selectedFileName =
      files.find((f) => f.id === selectedFileId)?.name || selectedFileId;

    let rowsToWrite: string[][] = [];
    let label = '';

    if (datasetType === 'leaderboard') {
      label = `Top ${leaderboard.length} Students Leaderboard`;
      rowsToWrite = [
        ['Rank', 'Student Name', 'Class', 'City', 'Score', 'Prize Status'],
        ...leaderboard.map((s) => [
          `#${s.rank}`,
          s.name,
          `Class ${s.classNum}`,
          s.city,
          `${s.score}/${s.total}`,
          s.prizePaid ? 'Paid' : 'Pending',
        ]),
      ];
    } else if (datasetType === 'payments') {
      label = `${payments.length} Razorpay Exam Payments`;
      rowsToWrite = [
        [
          'Payment ID',
          'Student Name',
          'Exam Type',
          'Amount (INR)',
          'Razorpay ID',
          'Status',
          'Timestamp',
        ],
        ...payments.map((p) => [
          p.id,
          p.userName,
          p.type,
          String(p.amount),
          p.razorpayId,
          p.status,
          p.createdAt,
        ]),
      ];
    } else if (datasetType === 'teachers') {
      label = `${teachers.length} Teacher Referral Records`;
      rowsToWrite = [
        [
          'Teacher Name',
          'Email',
          'Referral Code',
          'Tier',
          'Status',
          'Balance (INR)',
          'Total Earned (INR)',
        ],
        ...teachers.map((t) => [
          t.name,
          t.email,
          t.code,
          t.tier,
          t.status,
          String(t.balance),
          String(t.totalEarned),
        ]),
      ];
    } else {
      const topics = getTopicsForClass(12);
      label = '30-Day Curriculum Topics';
      rowsToWrite = [
        ['Day', 'Class 12 Topic Title', 'Format'],
        ...topics.map((t, i) => [`Day ${i + 1}`, t, 'Chapter Notes + 5 MCQs']),
      ];
    }

    setConfirmDialog({
      title: `Update Google Sheet "${selectedFileName}"?`,
      description: `Are you sure you want to write ${rowsToWrite.length} rows (${label}) into tab "${selectedTab}" of "${selectedFileName}"? Existing cells in ${selectedTab}!A1:G${rowsToWrite.length} will be updated.`,
      confirmLabel: 'Confirm & Sync to Sheet',
      isDestructive: false,
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) {
          setNeedsAuth(true);
          return;
        }
        setLoading(true);
        try {
          const res = await fetch('/api/sheets', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'writeRange',
              spreadsheetId: selectedFileId,
              sheetTitle: selectedTab,
              values: rowsToWrite,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Sync failed');
          toast.success(
            `Synced ${data.updatedRows || rowsToWrite.length} rows to "${selectedTab}"! ✅`
          );
          await fetchTabValues(selectedFileId, selectedTab);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setLoading(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  const promptAppendRow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFileId || !selectedTab) {
      toast.error('Select a spreadsheet and tab first!');
      return;
    }
    const selectedFileName =
      files.find((f) => f.id === selectedFileId)?.name || selectedFileId;
    const row = [
      `#${sheetRows.length}`,
      newRowStudent.trim(),
      `Class ${newRowClass}`,
      newRowCity.trim(),
      newRowScore.trim(),
      'Pending',
    ];

    setConfirmDialog({
      title: `Append Row to "${selectedTab}"?`,
      description: `This will add a new row for student "${newRowStudent}" (Class ${newRowClass}, ${newRowCity}, Score ${newRowScore}) to tab "${selectedTab}" in "${selectedFileName}".`,
      confirmLabel: 'Confirm & Append Row',
      isDestructive: false,
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) {
          setNeedsAuth(true);
          return;
        }
        setLoading(true);
        try {
          const res = await fetch('/api/sheets', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'appendRow',
              spreadsheetId: selectedFileId,
              sheetTitle: selectedTab,
              values: [row],
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to append row');
          toast.success(`Added ${newRowStudent} to Google Sheet! 🎉`);
          setNewRowStudent('');
          await fetchTabValues(selectedFileId, selectedTab);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setLoading(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  const promptDeleteSpreadsheet = () => {
    if (!selectedFileId) return;
    const selectedFileName =
      files.find((f) => f.id === selectedFileId)?.name || selectedFileId;

    setConfirmDialog({
      title: `Delete "${selectedFileName}" from Google Drive?`,
      description: `Are you sure you want to permanently delete the spreadsheet "${selectedFileName}" from your Google Drive? This action cannot be undone.`,
      confirmLabel: 'Yes, Delete Spreadsheet',
      isDestructive: true,
      onConfirm: async () => {
        const token = await getAccessToken();
        if (!token) {
          setNeedsAuth(true);
          return;
        }
        setLoading(true);
        try {
          const res = await fetch('/api/sheets', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'deleteFile',
              fileId: selectedFileId,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to delete file');
          toast.success(`Deleted "${selectedFileName}" from Google Drive.`);
          setSelectedFileId('');
          setSheetRows([]);
          await fetchSpreadsheetsList(token);
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setLoading(false);
          setConfirmDialog(null);
        }
      },
    });
  };

  const handleImportChaptersFromSheet = () => {
    if (sheetRows.length <= 1) {
      toast.error('Selected sheet tab has no data rows to import!');
      return;
    }
    const items: { day: number; title: string; content: string }[] = [];
    sheetRows.slice(1).forEach((row, idx) => {
      const dayMatch = String(row[0] || '').match(/\d+/);
      const day = dayMatch
        ? Math.min(30, Math.max(1, Number(dayMatch[0])))
        : idx + 1;
      const title = row[1] || `Day ${day} Imported Topic`;
      const content =
        row[2] || `Imported from Google Sheet (${selectedTab}): ${title}`;
      if (day >= 1 && day <= 30) {
        items.push({ day, title, content });
      }
    });
    const count = bulkSaveChapters(12, items, true);
    toast.success(
      `Imported ${count} chapters from Google Sheet tab "${selectedTab}"! 📚`
    );
  };

  const activeFile = files.find((f) => f.id === selectedFileId);

  return (
    <div className="mt-8 rounded-3xl border-2 border-secondary/30 bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold">
              Google Sheets &amp; Drive Live Sync
            </h2>
            <p className="text-xs text-muted-foreground">
              Export/Sync Leaderboard, Payments, Teacher Referrals &amp; Chapters directly with Google Sheets
            </p>
          </div>
        </div>

        {!needsAuth && googleUser && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary/15 px-3 py-1 text-xs font-semibold text-secondary">
              <CheckCircle2 className="h-3.5 w-3.5" /> {googleUser.email}
            </span>
            <button
              type="button"
              onClick={handleGoogleDisconnect}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold hover:bg-accent"
            >
              <LogOut className="h-3.5 w-3.5" /> Disconnect
            </button>
          </div>
        )}
      </div>

      {needsAuth ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <FileSpreadsheet className="h-10 w-10 text-secondary" />
          <h3 className="mt-3 text-base font-bold">
            Connect Your Google Account
          </h3>
          <p className="mt-1 max-w-md text-xs text-muted-foreground leading-relaxed">
            Sign in with Google to browse your Google Drive spreadsheets, create a live Uyanix 30 Days Challenge Master Sheet, or sync leaderboard &amp; payment records.
          </p>
          <div className="mt-5">
            <GoogleSignInButton
              onClick={handleGoogleLogin}
              disabled={isLoggingIn}
              label={isLoggingIn ? 'Signing in...' : 'Sign in with Google'}
            />
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-muted/20 p-4">
            <div className="min-w-[220px] flex-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Create New Google Spreadsheet
              </label>
              <input
                value={newSheetTitle}
                onChange={(e) => setNewSheetTitle(e.target.value)}
                placeholder="Enter new spreadsheet title..."
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleCreateMasterSheet}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-secondary px-5 text-xs font-semibold text-secondary-foreground shadow-soft transition hover:opacity-95 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Create Master Sheet in Drive
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select Spreadsheet from Google Drive ({files.length} found)
              </label>
              <div className="mt-1 flex gap-2">
                <select
                  value={selectedFileId}
                  onChange={(e) => setSelectedFileId(e.target.value)}
                  className="h-11 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                >
                  <option value="">-- Choose a Google Spreadsheet --</option>
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    const token = await getAccessToken();
                    if (token) fetchSpreadsheetsList(token);
                  }}
                  title="Refresh Drive Files"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background hover:bg-accent"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sheet Tab (Dynamic Metadata)
              </label>
              <select
                value={selectedTab}
                onChange={(e) => setSelectedTab(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"
              >
                {sheetTabs.length === 0 ? (
                  <option value="">No tabs loaded</option>
                ) : (
                  sheetTabs.map((t) => (
                    <option key={t.sheetId} value={t.title}>
                      {t.title}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {selectedFileId && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-accent/30 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => promptSyncDataset('leaderboard')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-soft hover:opacity-95"
                >
                  <UploadCloud className="h-3.5 w-3.5" /> Sync Leaderboard
                </button>
                <button
                  type="button"
                  onClick={() => promptSyncDataset('payments')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-xs font-semibold hover:bg-accent"
                >
                  <UploadCloud className="h-3.5 w-3.5 text-primary" /> Sync Payments
                </button>
                <button
                  type="button"
                  onClick={() => promptSyncDataset('teachers')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-xs font-semibold hover:bg-accent"
                >
                  <UploadCloud className="h-3.5 w-3.5 text-primary" /> Sync Teachers
                </button>
                <button
                  type="button"
                  onClick={() => promptSyncDataset('chapters')}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-xs font-semibold hover:bg-accent"
                >
                  <UploadCloud className="h-3.5 w-3.5 text-primary" /> Sync 30-Day Topics
                </button>
                <button
                  type="button"
                  onClick={handleImportChaptersFromSheet}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary/15 px-4 text-xs font-semibold text-secondary hover:bg-secondary/25"
                >
                  <DownloadCloud className="h-3.5 w-3.5" /> Import Tab to Chapters
                </button>
              </div>

              <div className="flex items-center gap-2">
                {activeFile?.webViewLink && (
                  <a
                    href={activeFile.webViewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-xs font-semibold text-primary hover:bg-accent"
                  >
                    Open in Sheets <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={promptDeleteSpreadsheet}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-destructive/40 px-3.5 text-xs font-semibold text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete Sheet
                </button>
              </div>
            </div>
          )}

          {selectedFileId && selectedTab && (
            <form
              onSubmit={promptAppendRow}
              className="grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-5"
            >
              <input
                required
                placeholder="Student Name"
                value={newRowStudent}
                onChange={(e) => setNewRowStudent(e.target.value)}
                className="h-9 rounded-xl border border-input bg-card px-3 text-xs outline-none focus:border-primary"
              />
              <select
                value={newRowClass}
                onChange={(e) => setNewRowClass(e.target.value)}
                className="h-9 rounded-xl border border-input bg-card px-3 text-xs outline-none focus:border-primary"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((c) => (
                  <option key={c} value={String(c)}>
                    Class {c}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="City"
                value={newRowCity}
                onChange={(e) => setNewRowCity(e.target.value)}
                className="h-9 rounded-xl border border-input bg-card px-3 text-xs outline-none focus:border-primary"
              />
              <input
                required
                placeholder="Score (e.g. 29/30)"
                value={newRowScore}
                onChange={(e) => setNewRowScore(e.target.value)}
                className="h-9 rounded-xl border border-input bg-card px-3 text-xs outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-gradient-hero px-4 text-xs font-semibold text-primary-foreground shadow-soft"
              >
                <Plus className="h-3.5 w-3.5" /> Append Row
              </button>
            </form>
          )}

          {selectedFileId && (
            <div className="overflow-hidden rounded-2xl border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-semibold">
                <span>
                  Live Preview: <b className="text-primary">{selectedTab || 'Tab'}</b> (
                  {sheetRows.length} rows)
                </span>
                <button
                  type="button"
                  onClick={() => fetchTabValues(selectedFileId, selectedTab)}
                  className="text-primary hover:underline"
                >
                  Refresh Cells
                </button>
              </div>

              {sheetRows.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Is sheet tab mein abhi koi rows nahi hain. Upar &quot;Sync Leaderboard&quot; button click karke data populate karein!
                </div>
              ) : (
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-accent/50 text-left uppercase text-muted-foreground">
                      <tr>
                        {sheetRows[0].map((headerCell, i) => (
                          <th key={i} className="px-3 py-2 font-bold">
                            {headerCell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheetRows.slice(1).map((row, rIdx) => (
                        <tr key={rIdx} className="border-t border-border">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3 py-2 tabular-nums">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2 text-lg font-bold">
              <AlertTriangle
                className={`h-5 w-5 ${
                  confirmDialog.isDestructive ? 'text-destructive' : 'text-saffron'
                }`}
              />
              {confirmDialog.title}
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {confirmDialog.description}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="h-10 rounded-full border border-border px-4 text-xs font-semibold hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={confirmDialog.onConfirm}
                className={`h-10 rounded-full px-5 text-xs font-semibold text-white shadow-soft ${
                  confirmDialog.isDestructive
                    ? 'bg-destructive hover:opacity-90'
                    : 'bg-gradient-hero hover:opacity-95'
                }`}
              >
                {loading ? 'Processing...' : confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
