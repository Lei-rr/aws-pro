<?php

declare(strict_types=1);

namespace app\controller\account;

use app\service\account\AccountService;
use app\support\ApiResponse;
use app\support\AwsValidator;
use think\Response;

class AccountController
{
    public function __construct(private readonly AccountService $accounts)
    {
    }

    public function index(): Response
    {
        return ApiResponse::data($this->accounts->allPublic());
    }

    public function show(string $id): Response
    {
        return ApiResponse::data($this->accounts->findPublic(AwsValidator::accountId($id)));
    }

    public function store(): Response
    {
        return ApiResponse::data($this->accounts->create(input('post.', [])), 201);
    }

    public function update(string $id): Response
    {
        return ApiResponse::data($this->accounts->update(AwsValidator::accountId($id), input('put.', [])));
    }

    public function delete(string $id): Response
    {
        $this->accounts->delete(AwsValidator::accountId($id));

        return ApiResponse::noContent();
    }
}
