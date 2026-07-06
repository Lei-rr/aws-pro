<?php
// +----------------------------------------------------------------------
// | ThinkPHP [ WE CAN DO IT JUST THINK ]
// +----------------------------------------------------------------------
// | Copyright (c) 2006~2018 http://thinkphp.cn All rights reserved.
// +----------------------------------------------------------------------
// | Licensed ( http://www.apache.org/licenses/LICENSE-2.0 )
// +----------------------------------------------------------------------
// | Author: liu21st <liu21st@gmail.com>
// +----------------------------------------------------------------------
use think\facade\Route;
use app\controller\auth\SessionController;
use app\controller\Index;
use app\controller\system\ConfigController;
use app\controller\system\HealthController;
use app\support\ApiResponse;
use app\support\ErrorMessages;

Route::get('/', [Index::class, 'index']);
Route::get('login', [Index::class, 'index']);
Route::get('user', [Index::class, 'index']);
Route::get('accounts', [Index::class, 'index']);
Route::get('lightsail', [Index::class, 'index']);
Route::get('lightsail/<path>', [Index::class, 'index'])->pattern(['path' => '.*']);
Route::get('ec2', [Index::class, 'index']);
Route::get('newbie', [Index::class, 'index']);
Route::get('regions', [Index::class, 'index']);
Route::get('quota', [Index::class, 'index']);
Route::get('billing', [Index::class, 'index']);

Route::group('api', function () {
    Route::get('health', [HealthController::class, 'show']);

    Route::post('session', [SessionController::class, 'store'])->middleware('rate.limit');
    Route::get('session', [SessionController::class, 'show']);
    Route::delete('session', [SessionController::class, 'delete']);

    Route::group(function () {
        Route::get('config', [ConfigController::class, 'index']);

        require __DIR__ . '/api/account.php';
        require __DIR__ . '/api/lightsail.php';
        require __DIR__ . '/api/ec2.php';
        require __DIR__ . '/api/newbie.php';
        require __DIR__ . '/api/region.php';
        require __DIR__ . '/api/quota.php';
        require __DIR__ . '/api/billing.php';
    })->middleware('auth.required');

    Route::miss(fn () => ApiResponse::error(
        ErrorMessages::translate('not_found') ?? 'API endpoint not found',
        404,
        'not_found',
    ));
});
