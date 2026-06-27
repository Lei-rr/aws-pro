<?php

declare(strict_types=1);

use app\controller\quota\QuotaController;
use think\facade\Route;

Route::post('quotas/vcpu', [QuotaController::class, 'vcpu']);
