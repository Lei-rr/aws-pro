<?php

use app\controller\newbie\NewbieTaskController;
use think\facade\Route;

Route::post('newbie/tasks', [NewbieTaskController::class, 'store']);
Route::get('newbie/tasks/:task', [NewbieTaskController::class, 'show']);
Route::post('newbie/tasks/:task/cancel', [NewbieTaskController::class, 'cancel']);
Route::get('newbie/tasks/:task/stream', [NewbieTaskController::class, 'stream']);
