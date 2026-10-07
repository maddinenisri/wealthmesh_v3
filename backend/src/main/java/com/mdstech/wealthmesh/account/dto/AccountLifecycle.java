package com.mdstech.wealthmesh.account.dto;

import java.util.List;

/**
 * What the review of a lifecycle action needs: whether the account can be deleted and, if not, what saved history or
 * Balance stops it, and what stops a close other than the Balance (a plan on a property or other asset). The writes
 * check again under the account lock; this only lets the screen explain first.
 */
public record AccountLifecycle(boolean canDelete, List<String> deleteBlockedBy, List<String> closeBlockedBy) {
}
