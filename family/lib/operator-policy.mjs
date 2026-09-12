// Explicit operator authorization; independent of the scientific response rule.
export const TOTAL_BUDGET_ETH='0.02';
export const CHILD_CREATOR_TAX_BPS=0; // PONS base fee is separate; do not add a tax.
export const MAX_PILOT_CHILDREN=1;
export function birthSlotAvailable(prior,confirmedCount,now,cooldownSeconds){
 if(confirmedCount>=MAX_PILOT_CHILDREN)return false;
 return !prior||(prior.status==='confirmed'&&Number.isFinite(Date.parse(prior.confirmedAt))&&now-Date.parse(prior.confirmedAt)>cooldownSeconds*1000);
}
