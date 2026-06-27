<?php

declare(strict_types=1);

use app\controller\billing\BillingController;
use think\facade\Route;

Route::post('billing/yearly', [BillingController::class, 'yearly']);
