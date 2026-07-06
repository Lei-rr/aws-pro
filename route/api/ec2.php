<?php

use app\controller\ec2\Ec2Controller;
use think\facade\Route;

Route::get('ec2/instances', [Ec2Controller::class, 'instances'])->completeMatch();
Route::post('ec2/instances/sync', [Ec2Controller::class, 'sync']);
Route::get('ec2/create-options', [Ec2Controller::class, 'options']);
Route::post('ec2/instances', [Ec2Controller::class, 'store'])->completeMatch();
Route::post('ec2/instances/:instance/actions', [Ec2Controller::class, 'action']);
