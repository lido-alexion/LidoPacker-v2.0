<?php
/**
 * JSON suggestion store. Lives next to /packer/ so a full packer/ replace
 * on deploy does not wipe the list.
 *
 * Path: {public_html}/packer-data/suggestions.json
 * That folder is created on first write and denied from the web.
 */

function lidopacker_suggestions_dir(): string
{
    return dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'packer-data';
}

function lidopacker_suggestions_path(): string
{
    return lidopacker_suggestions_dir() . DIRECTORY_SEPARATOR . 'suggestions.json';
}

function lidopacker_name_key(string $name): string
{
    $key = strtolower($name);
    $key = preg_replace('/[^a-z0-9]+/', '', $key) ?? '';
    return $key;
}

function lidopacker_sanitise_name(string $name): string
{
    $name = trim(preg_replace('/\s+/', ' ', $name) ?? '');
    if (function_exists('mb_substr')) {
        return mb_substr($name, 0, 80);
    }
    return substr($name, 0, 80);
}

function lidopacker_empty_store(): array
{
    return ['updatedAt' => gmdate('c'), 'items' => []];
}

function lidopacker_ensure_data_dir(): void
{
    $dir = lidopacker_suggestions_dir();
    if (!is_dir($dir)) {
        mkdir($dir, 0750, true);
        file_put_contents(
            $dir . DIRECTORY_SEPARATOR . '.htaccess',
            "Require all denied\nDeny from all\n"
        );
    }
}

function lidopacker_read_store($fh): array
{
    $raw = stream_get_contents($fh);
    if ($raw === false || trim($raw) === '') {
        return lidopacker_empty_store();
    }
    $data = json_decode($raw, true);
    if (!is_array($data) || !isset($data['items']) || !is_array($data['items'])) {
        return lidopacker_empty_store();
    }
    return $data;
}

function lidopacker_write_store($fh, array $data): void
{
    $data['updatedAt'] = gmdate('c');
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, $json === false ? '{"updatedAt":"","items":[]}' : $json);
}

/**
 * @return array{ok:bool,error?:string,count?:int}
 */
function lidopacker_add_suggestion(string $name, string $category = 'Custom'): array
{
    $name = lidopacker_sanitise_name($name);
    if ($name === '') {
        return ['ok' => false, 'error' => 'Name is required.'];
    }
    $category = lidopacker_sanitise_name($category);
    if ($category === '') {
        $category = 'Custom';
    }

    lidopacker_ensure_data_dir();
    $path = lidopacker_suggestions_path();
    $fh = fopen($path, 'c+');
    if ($fh === false) {
        return ['ok' => false, 'error' => 'Could not open suggestion file.'];
    }
    if (!flock($fh, LOCK_EX)) {
        fclose($fh);
        return ['ok' => false, 'error' => 'Could not lock suggestion file.'];
    }

    $store = lidopacker_read_store($fh);
    $key = lidopacker_name_key($name);
    if ($key === '') {
        flock($fh, LOCK_UN);
        fclose($fh);
        return ['ok' => false, 'error' => 'Name is required.'];
    }

    $now = gmdate('c');
    $found = false;
    foreach ($store['items'] as &$row) {
        if (($row['nameKey'] ?? '') === $key) {
            $row['count'] = (int) ($row['count'] ?? 1) + 1;
            $row['lastAt'] = $now;
            $found = true;
            break;
        }
    }
    unset($row);

    if (!$found) {
        if (count($store['items']) >= 3000) {
            flock($fh, LOCK_UN);
            fclose($fh);
            return ['ok' => false, 'error' => 'Suggestion list is full.'];
        }
        $store['items'][] = [
            'name' => $name,
            'nameKey' => $key,
            'category' => $category,
            'count' => 1,
            'firstAt' => $now,
            'lastAt' => $now,
        ];
    }

    rewind($fh);
    lidopacker_write_store($fh, $store);
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    return ['ok' => true, 'count' => count($store['items'])];
}

function lidopacker_list_suggestions(): array
{
    $path = lidopacker_suggestions_path();
    if (!is_file($path)) {
        return [];
    }
    $fh = fopen($path, 'r');
    if ($fh === false) {
        return [];
    }
    flock($fh, LOCK_SH);
    $store = lidopacker_read_store($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
    $items = $store['items'];
    usort($items, function ($a, $b) {
        return strcasecmp((string) ($a['name'] ?? ''), (string) ($b['name'] ?? ''));
    });
    return $items;
}

function lidopacker_clear_suggestions(): void
{
    lidopacker_ensure_data_dir();
    $path = lidopacker_suggestions_path();
    $fh = fopen($path, 'c+');
    if ($fh === false) {
        return;
    }
    flock($fh, LOCK_EX);
    rewind($fh);
    lidopacker_write_store($fh, lidopacker_empty_store());
    fflush($fh);
    flock($fh, LOCK_UN);
    fclose($fh);
}
