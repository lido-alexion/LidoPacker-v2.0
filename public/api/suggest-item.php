<?php
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

require __DIR__ . '/../php/suggestions-store.php';

$raw = file_get_contents('php://input');
$payload = json_decode($raw ?: '', true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$name = isset($payload['name']) && is_string($payload['name']) ? $payload['name'] : '';
$category = isset($payload['category']) && is_string($payload['category']) ? $payload['category'] : 'Custom';

$result = lidopacker_add_suggestion($name, $category);
if (empty($result['ok'])) {
    http_response_code(400);
}
echo json_encode($result);
