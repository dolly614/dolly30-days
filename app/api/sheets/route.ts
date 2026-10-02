import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization');
  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing Bearer token' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action') || 'listSpreadsheets';
  const spreadsheetId = searchParams.get('spreadsheetId');
  const range = searchParams.get('range');

  try {
    if (action === 'listSpreadsheets') {
      const query = encodeURIComponent(
        "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
      );
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=25&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,webViewLink)`;
      const res = await fetch(url, {
        headers: { Authorization: token },
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          {
            error:
              data?.error?.message ||
              'Failed to list Google Drive spreadsheets',
          },
          { status: res.status }
        );
      }
      return NextResponse.json({ files: data.files || [] });
    }

    if (action === 'getSpreadsheetMeta') {
      if (!spreadsheetId) {
        return NextResponse.json(
          { error: 'Missing spreadsheetId' },
          { status: 400 }
        );
      }
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
        {
          headers: { Authorization: token },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          {
            error:
              data?.error?.message || 'Failed to read spreadsheet metadata',
          },
          { status: res.status }
        );
      }
      const sheets = (data.sheets || []).map(
        (s: { properties?: { sheetId?: number; title?: string } }) => ({
          sheetId: s.properties?.sheetId ?? 0,
          title: s.properties?.title || 'Tab',
        })
      );
      return NextResponse.json({
        spreadsheetId: data.spreadsheetId,
        title: data.properties?.title || 'Spreadsheet',
        spreadsheetUrl: data.spreadsheetUrl,
        sheets,
      });
    }

    if (action === 'readRange') {
      if (!spreadsheetId || !range) {
        return NextResponse.json(
          { error: 'Missing spreadsheetId or range' },
          { status: 400 }
        );
      }
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          range
        )}`,
        {
          headers: { Authorization: token },
        }
      );
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { error: data?.error?.message || 'Failed to read range values' },
          { status: res.status }
        );
      }
      return NextResponse.json({
        range: data.range,
        values: data.values || [],
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization');
  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing Bearer token' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { action, title, spreadsheetId, sheetTitle, values, fileId } = body;

    if (action === 'createSpreadsheet') {
      const createRes = await fetch(
        'https://sheets.googleapis.com/v4/spreadsheets',
        {
          method: 'POST',
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            properties: {
              title: title || 'Uyanix 30 Days Challenge — Master Tracker',
            },
            sheets: [
              { properties: { title: 'Leaderboard' } },
              { properties: { title: 'Payments' } },
              { properties: { title: 'Teachers' } },
              { properties: { title: 'Chapters' } },
            ],
          }),
        }
      );
      const created = await createRes.json();
      if (!createRes.ok) {
        return NextResponse.json(
          { error: created?.error?.message || 'Failed to create spreadsheet' },
          { status: createRes.status }
        );
      }

      if (Array.isArray(values) && values.length > 0) {
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${
            created.spreadsheetId
          }/values/${encodeURIComponent(
            'Leaderboard!A1'
          )}?valueInputOption=USER_ENTERED`,
          {
            method: 'PUT',
            headers: {
              Authorization: token,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ values }),
          }
        );
      }

      return NextResponse.json({
        spreadsheetId: created.spreadsheetId,
        title: created.properties?.title,
        spreadsheetUrl: created.spreadsheetUrl,
      });
    }

    if (action === 'writeRange') {
      if (!spreadsheetId || !sheetTitle || !Array.isArray(values)) {
        return NextResponse.json(
          { error: 'Missing spreadsheetId, sheetTitle, or values' },
          { status: 400 }
        );
      }

      const targetRange = `${sheetTitle}!A1`;
      const writeRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          targetRange
        )}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values }),
        }
      );
      const writeData = await writeRes.json();
      if (!writeRes.ok) {
        return NextResponse.json(
          { error: writeData?.error?.message || 'Failed to write to sheet' },
          { status: writeRes.status }
        );
      }
      return NextResponse.json({
        updatedCells: writeData.updatedCells,
        updatedRows: writeData.updatedRows,
        updatedRange: writeData.updatedRange,
      });
    }

    if (action === 'appendRow') {
      if (!spreadsheetId || !sheetTitle || !Array.isArray(values)) {
        return NextResponse.json(
          { error: 'Missing spreadsheetId, sheetTitle, or values' },
          { status: 400 }
        );
      }

      const targetRange = `${sheetTitle}!A1`;
      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
          targetRange
        )}:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            Authorization: token,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ values }),
        }
      );
      const appendData = await appendRes.json();
      if (!appendRes.ok) {
        return NextResponse.json(
          { error: appendData?.error?.message || 'Failed to append row' },
          { status: appendRes.status }
        );
      }
      return NextResponse.json({
        updates: appendData.updates,
      });
    }

    if (action === 'deleteFile') {
      if (!fileId) {
        return NextResponse.json({ error: 'Missing fileId' }, { status: 400 });
      }
      const delRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}`,
        {
          method: 'DELETE',
          headers: { Authorization: token },
        }
      );
      if (!delRes.ok) {
        const errData = await delRes.json().catch(() => ({}));
        return NextResponse.json(
          {
            error:
              errData?.error?.message || 'Failed to delete spreadsheet',
          },
          { status: delRes.status }
        );
      }
      return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: 'Unknown POST action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
