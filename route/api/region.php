<?php

declare(strict_types=1);

use app\controller\region\RegionController;
use think\facade\Route;

Route::get('regions', [RegionController::class, 'index']);
Route::post('regions/enable', [RegionController::class, 'enable']);
