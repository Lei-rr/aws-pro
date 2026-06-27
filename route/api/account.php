<?php

declare(strict_types=1);

use app\controller\account\AccountController;
use think\facade\Route;

Route::get('accounts', [AccountController::class, 'index'])->completeMatch();
Route::post('accounts', [AccountController::class, 'store']);
Route::get('accounts/:id', [AccountController::class, 'show'])->pattern(['id' => '[^/]+']);
Route::put('accounts/:id', [AccountController::class, 'update'])->pattern(['id' => '[^/]+']);
Route::delete('accounts/:id', [AccountController::class, 'delete'])->pattern(['id' => '[^/]+']);
