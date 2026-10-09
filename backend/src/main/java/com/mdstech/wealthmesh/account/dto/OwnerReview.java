package com.mdstech.wealthmesh.account.dto;

import java.util.List;

/**
 * What an owner correction would do, written to nothing: the owners now (`from`) and after (`to`), named as the
 * history will name them, and the Balance the account keeps (cash, holdings and Balance are never touched).
 */
public record OwnerReview(String accountId, String name, String type, List<Owner> from, List<Owner> to,
        String balance) {

    /** One member as the account lists them. */
    public record Owner(String id, String name) {
    }
}
