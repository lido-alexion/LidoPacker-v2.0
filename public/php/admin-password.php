<?php
/**
 * Admin password file lives three levels above packer/php/:
 *   {cPanel home}/lidopacker-admin-password.php
 * That is the FTP/File Manager root, outside public_html, so it is not
 * served as a website and does not show up in /packer/ directory listings.
 *
 * This file is created on first admin visit with the default password.
 * Change the return '...' line via FTP, then save.
 */

function lidopacker_admin_password_path(): string
{
    return dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'lidopacker-admin-password.php';
}

function lidopacker_admin_password_template(string $password): string
{
    $escaped = var_export($password, true);
    return <<<PHP
<?php
// LidoPacker admin password. Edit the line below via FTP, then save.
// This file sits above public_html — it is not a web page.
return {$escaped};

PHP;
}

function lidopacker_ensure_admin_password_file(): ?string
{
    $path = lidopacker_admin_password_path();
    if (is_file($path)) {
        return null;
    }
    $dir = dirname($path);
    if (!is_dir($dir) || !is_writable($dir)) {
        return 'Could not create the password file. In FTP/File Manager go to the folder above public_html and create lidopacker-admin-password.php';
    }
    $ok = @file_put_contents($path, lidopacker_admin_password_template('PackReview26!'));
    if ($ok === false) {
        return 'Could not write ' . $path;
    }
    @chmod($path, 0600);
    return null;
}

function lidopacker_load_admin_password(): ?string
{
    $path = lidopacker_admin_password_path();
    if (!is_file($path)) {
        return null;
    }
    $value = include $path;
    if (!is_string($value) || $value === '') {
        return null;
    }
    return trim($value);
}

function lidopacker_admin_password_ok(string $typed): bool
{
    $expected = lidopacker_load_admin_password();
    if ($expected === null || $expected === '') {
        return false;
    }
    return hash_equals($expected, $typed);
}
