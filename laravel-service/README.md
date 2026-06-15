# Laravel Service Scaffold

This folder contains notes and a minimal example for integrating a Laravel-based service that can edit web content and persist it to cloud storage.

Local quickstart:

1. Install Composer and PHP (see https://getcomposer.org).
2. Create a new Laravel app:

```bash
composer create-project laravel/laravel laravel-service
```

3. Inside the Laravel app, add a route that proxies content edits to the main project's content API (or directly to S3).

Example route (in `routes/api.php`):

```php
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

Route::post('/edit-content', function (Request $request) {
    $key = $request->input('key');
    $html = $request->input('html');
    $resp = Http::post(env('CONTENT_API_URL'), ['key' => $key, 'html' => $html]);
    return response()->json($resp->json(), $resp->status());
});
```

4. Set `CONTENT_API_URL` in `.env` to point to the Node project's endpoint that accepts content (or S3 presigned uploads).

Notes:
- This README is a scaffold; implement authentication and validation for production.
- You can also implement direct S3 uploads from Laravel using the `s3` filesystem driver.
