/* Confirmations: one threshold and one way to count them, for the summary, send and every view. */

//confirmations after which an output is spendable (summary, send, amount field, rings)
export const MIN_CONFIRMATIONS = 3;

/*
 * Confirmations of something mined at `height`, seen from `tip`: the block holding it counts as
 * the first, like epic-wallet's OutputData::num_confirmations. null when either height is unknown.
 */
export function confirmationsAt(height, tip){
  const h = Number(height);
  const t = Number(tip);
  if(!(h > 0) || !(t > 0)){
    return null;
  }
  return t >= h ? t - h + 1 : 0;
}

/*
 * The height each wallet tx was mined at, from the outputs it created
 * (received outputs, or the change of a send): tx_log_entry -> {height, lockHeight}, the highest
 * output height (0 while its outputs are not in a block yet, status Unconfirmed) and, for a
 * mining reward, its lock height.
 */
export function txHeights(outputs){
  const heights = {};
  for(const o of outputs || []){
    if(o.tx_log_entry === null || o.tx_log_entry === undefined){
      continue;
    }
    const h = o.status === 'Unconfirmed' ? 0 : Number(o.height);
    const e = heights[o.tx_log_entry] || (heights[o.tx_log_entry] = { height: -1, lockHeight: 0 });
    if(h > e.height){
      e.height = h;
    }
    if(o.is_coinbase){
      e.lockHeight = Math.max(e.lockHeight, Number(o.lock_height) || 0);
    }
  }
  return heights;
}

/*
 * Where an output stands: 'waiting' (not in a block yet), 'confirming', 'immature' (a mining
 * reward before its lock height), 'confirmed', or 'locked' / 'spent' as the wallet says.
 */
export function outputConfirmationState(o, tip){
  if(o.status === 'Unconfirmed'){
    return { state: 'waiting', confirmations: null };
  }
  const n = confirmationsAt(o.height, tip);
  if(o.status === 'Locked'){
    return { state: 'locked', confirmations: n };
  }
  if(o.status === 'Spent'){
    return { state: 'spent', confirmations: n };
  }
  if(n !== null && n < MIN_CONFIRMATIONS){
    return { state: 'confirming', confirmations: n };
  }
  if(o.is_coinbase && tip > 0 && Number(o.lock_height) > tip){
    return { state: 'immature', confirmations: n };
  }
  return { state: 'confirmed', confirmations: n };
}

/*
 * Where a wallet tx stands for its ring: 'waiting' (not in a block yet), 'confirming'
 * (in a block, fewer than MIN_CONFIRMATIONS), 'immature', 'confirmed' or 'cancelled', with its count.
 */
export function txConfirmationState(tx, heights, tip){
  if(tx.status === 'cancelled'){
    return { state: 'cancelled', confirmations: null };
  }
  if(!tx.confirmed){
    return { state: 'waiting', confirmations: null };
  }
  const e = heights[tx.id];
  //the tx log can be a refresh ahead of the outputs list: just mined, so 1 until the outputs follow
  if(e && e.height === 0){
    return { state: 'confirming', confirmations: 1 };
  }
  const n = e ? confirmationsAt(e.height, tip) : null;
  //confirmed, but no output of its own left: spent (so past the threshold), or a send
  //without change, whose height the wallet does not give
  if(n === null){
    return { state: 'confirmed', confirmations: null };
  }
  if(n < MIN_CONFIRMATIONS){
    return { state: 'confirming', confirmations: n };
  }
  //a mining reward before its lock height, as on the Coins tab
  if(e.lockHeight > tip){
    return { state: 'immature', confirmations: n };
  }
  return { state: 'confirmed', confirmations: n };
}
