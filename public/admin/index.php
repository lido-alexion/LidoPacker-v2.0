<?php
session_start();
require __DIR__ . '/../php/suggestions-store.php';
require __DIR__ . '/../php/admin-password.php';

$setupError = lidopacker_ensure_admin_password_file();
$authed = !empty($_SESSION['lidopacker_admin']);
$error = $setupError ?: '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['logout'])) {
    $_SESSION = [];
    session_destroy();
    header('Location: index.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['login'])) {
    $pass = isset($_POST['pass']) ? (string) $_POST['pass'] : '';
    if (lidopacker_admin_password_ok($pass)) {
        session_regenerate_id(true);
        $_SESSION['lidopacker_admin'] = 1;
        header('Location: index.php');
        exit;
    }
    usleep(400000);
    $error = 'Wrong password.';
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['clear']) && $authed) {
    if (isset($_POST['confirm']) && $_POST['confirm'] === '1') {
        lidopacker_clear_suggestions();
        header('Location: index.php?cleared=1');
        exit;
    }
}

$items = $authed ? lidopacker_list_suggestions() : [];
$cleared = isset($_GET['cleared']);

function h($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8');
}

function fmt_when(?string $iso): string
{
    if (!$iso) {
        return '—';
    }
    $t = strtotime($iso);
    return $t ? gmdate('Y-m-d H:i', $t) . ' UTC' : h($iso);
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>LidoPacker suggestions</title>
  <style>
    :root { --text:#1e293b; --muted:#64748b; --border:#e2e8f0; --bg:#f8fafc; --accent:#16a34a; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Segoe UI, system-ui, sans-serif; background:var(--bg); color:var(--text); }
    main { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: var(--muted); }
    .card { background:#fff; border:1px solid var(--border); border-radius:8px; padding:20px; }
    label { display:block; font-size:13px; font-weight:600; margin: 12px 0 6px; }
    input { width:100%; height:42px; padding:0 12px; border:1.5px solid var(--border); border-radius:6px; font-size:15px; }
    button { height:42px; padding:0 16px; border-radius:6px; border:none; font-weight:600; cursor:pointer; }
    .btn { background:var(--accent); color:#fff; }
    .btn-ghost { background:#fff; border:1.5px solid var(--border); color:var(--text); }
    .btn-danger { background:#fee2e2; color:#dc2626; border:1.5px solid #dc2626; }
    .row { display:flex; gap:8px; flex-wrap:wrap; margin-top:16px; }
    .error { color:#dc2626; font-size:14px; }
    .ok { color:var(--accent); font-size:14px; }
    table { width:100%; border-collapse: collapse; font-size:14px; }
    th, td { text-align:left; padding:10px 8px; border-bottom:1px solid var(--border); vertical-align:top; }
    th { font-size:12px; color:var(--muted); font-weight:600; }
    .count { font-variant-numeric: tabular-nums; }
    .toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin: 16px 0; }
  </style>
</head>
<body>
<main>
  <h1>Item suggestions</h1>
<?php if (!$authed): ?>
  <p>Password only. The password file sits above <code>public_html</code> (FTP / File Manager home), not on the website.</p>
  <div class="card">
    <?php if ($error): ?><p class="error"><?php echo h($error); ?></p><?php endif; ?>
    <form method="post">
      <label for="pass">Password</label>
      <input id="pass" name="pass" type="password" autocomplete="current-password" required autofocus />
      <div class="row">
        <button class="btn" type="submit" name="login" value="1">Sign in</button>
      </div>
    </form>
  </div>
<?php else: ?>
  <p><?php echo count($items); ?> suggested name<?php echo count($items) === 1 ? '' : 's'; ?>, A–Z. Duplicates are counted, not listed twice.</p>
  <div class="toolbar">
    <form method="post">
      <button class="btn-ghost" type="submit" name="logout" value="1">Sign out</button>
    </form>
    <form method="post" onsubmit="return confirm('Clear the whole suggestion list? This cannot be undone.');">
      <input type="hidden" name="confirm" value="1" />
      <button class="btn-danger" type="submit" name="clear" value="1" <?php echo count($items) ? '' : 'disabled'; ?>>Clear all</button>
    </form>
  </div>
  <?php if ($cleared): ?><p class="ok">Suggestion list cleared.</p><?php endif; ?>
  <div class="card" style="padding:0; overflow:auto">
    <?php if (!$items): ?>
      <p style="padding:20px">No suggestions yet.</p>
    <?php else: ?>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Times</th>
            <th>First</th>
            <th>Last</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($items as $row): ?>
            <tr>
              <td><?php echo h($row['name'] ?? ''); ?></td>
              <td class="count"><?php echo (int) ($row['count'] ?? 1); ?></td>
              <td><?php echo fmt_when($row['firstAt'] ?? null); ?></td>
              <td><?php echo fmt_when($row['lastAt'] ?? null); ?></td>
            </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    <?php endif; ?>
  </div>
<?php endif; ?>
</main>
</body>
</html>
