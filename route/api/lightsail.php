<?php

declare(strict_types=1);

use app\controller\lightsail\LightsailController;
use think\facade\Route;

Route::get('lightsail/instances', [LightsailController::class, 'instances'])->completeMatch();
Route::post('lightsail/instances/sync', [LightsailController::class, 'sync']);
Route::get('lightsail/create-options', [LightsailController::class, 'createOptions']);
Route::put('lightsail/instances/:instance/remark', [LightsailController::class, 'remark']);
Route::post('lightsail/instances/:instance/actions', [LightsailController::class, 'action']);
Route::post('lightsail/instances', [LightsailController::class, 'store'])->completeMatch();
