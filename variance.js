// ==================== VARIANCE VALIDATION ====================
// Standalone variance check + explanation popup for all inventory pages.
// Requires: `db` and `auth` from Firebase to be available globally.
// Usage: call checkVariance({ ... }) before accepting a count.
// Returns a Promise that resolves to true (accepted) or false (reverted).

let _varianceModal = null;

function _ensureVarianceModal() {
  if (_varianceModal) return;
  const overlay = document.createElement('div');
  overlay.id = 'varianceOverlay';
  overlay.innerHTML = `
    <div class="variance-modal">
      <h3 id="varianceTitle"></h3>
      <p id="varianceMsg" style="margin:8px 0 16px;color:#374151;font-size:.9rem"></p>
      <div style="margin-bottom:12px">
        <label style="display:block;font-weight:600;font-size:.85rem;margin-bottom:6px;color:#374151">Reason <span style="color:#dc2626">*</span></label>
        <select id="varianceReason" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:.9rem">
          <option value="">Select a reason...</option>
          <option value="prev_qty_wrong">Previous quantity was entered incorrectly</option>
          <option value="delivery_received">Received different quantity in delivery</option>
          <option value="found_stock">Found additional stock (miscounted)</option>
          <option value="transfer_in">Transfer received from another location</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div id="varianceExplainWrap" style="display:none;margin-bottom:12px">
        <label style="display:block;font-weight:600;font-size:.85rem;margin-bottom:6px;color:#374151">Explanation <span style="color:#dc2626">*</span></label>
        <textarea id="varianceExplain" rows="2" placeholder="Please explain..." style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:.9rem;resize:vertical"></textarea>
      </div>
      <div style="margin-bottom:12px">
        <label style="display:block;font-weight:600;font-size:.85rem;margin-bottom:6px;color:#374151">Your Name <span style="color:#dc2626">*</span></label>
        <input type="text" id="varianceName" placeholder="Enter your name" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:.9rem">
      </div>
      <div id="varianceError" style="color:#dc2626;font-size:.85rem;margin-bottom:10px;display:none"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="varianceCancelBtn" style="padding:10px 20px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:.9rem;font-weight:500">Cancel</button>
        <button id="varianceSubmitBtn" style="padding:10px 20px;border:none;border-radius:6px;background:#dc2626;color:#fff;cursor:pointer;font-size:.9rem;font-weight:600">Confirm Variance</button>
      </div>
    </div>`;
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:10000';
  const modal = overlay.querySelector('.variance-modal');
  modal.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:440px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.3)';
  document.body.appendChild(overlay);

  document.getElementById('varianceReason').addEventListener('change', function() {
    document.getElementById('varianceExplainWrap').style.display = this.value === 'other' ? 'block' : 'none';
  });

  _varianceModal = overlay;
}

/**
 * checkVariance - call when a new value exceeds the expected max.
 * @param {Object} opts
 * @param {string} opts.itemName     - Display name of the item
 * @param {number} opts.newValue     - The value the user entered
 * @param {number} opts.maxExpected  - The maximum expected value
 * @param {string} opts.page         - Which page triggered this
 * @param {string} opts.itemId       - Item ID for logging
 * @param {string} opts.dateKey      - Date or week key for logging
 * @param {string} [opts.field]      - Field name (e.g., 'pm', 'count')
 * @returns {Promise<boolean>} true if user confirmed with a reason, false if cancelled
 */
function checkVariance(opts) {
  _ensureVarianceModal();
  return new Promise((resolve) => {
    const overlay = _varianceModal;
    const diff = opts.newValue - opts.maxExpected;

    document.getElementById('varianceTitle').textContent = '\u26a0\ufe0f Variance Detected';
    document.getElementById('varianceMsg').innerHTML =
      `<strong>${opts.itemName}</strong>: you entered <strong>${opts.newValue}</strong> but the expected max is <strong>${opts.maxExpected}</strong>.<br>` +
      `That\u2019s <strong>+${Math.round(diff * 100) / 100}</strong> over. Please provide a reason.`;
    document.getElementById('varianceReason').value = '';
    document.getElementById('varianceExplain').value = '';
    document.getElementById('varianceName').value = (typeof auth !== 'undefined' && auth.currentUser && auth.currentUser.displayName) || '';
    document.getElementById('varianceExplainWrap').style.display = 'none';
    document.getElementById('varianceError').style.display = 'none';

    overlay.style.display = 'flex';

    function cleanup() {
      overlay.style.display = 'none';
      document.getElementById('varianceSubmitBtn').removeEventListener('click', onSubmit);
      document.getElementById('varianceCancelBtn').removeEventListener('click', onCancel);
    }

    function onCancel() { cleanup(); resolve(false); }

    function onSubmit() {
      const reason = document.getElementById('varianceReason').value;
      const explain = document.getElementById('varianceExplain').value.trim();
      const name = document.getElementById('varianceName').value.trim();
      const errEl = document.getElementById('varianceError');

      if (!reason) { errEl.textContent = 'Please select a reason.'; errEl.style.display = 'block'; return; }
      if (reason === 'other' && !explain) { errEl.textContent = 'Please provide an explanation.'; errEl.style.display = 'block'; return; }
      if (!name) { errEl.textContent = 'Please enter your name.'; errEl.style.display = 'block'; return; }

      // Log to Firestore
      const logEntry = {
        page: opts.page || 'unknown',
        itemId: opts.itemId,
        itemName: opts.itemName,
        dateKey: opts.dateKey || '',
        field: opts.field || 'count',
        enteredValue: opts.newValue,
        expectedMax: opts.maxExpected,
        variance: diff,
        reason: reason,
        explanation: reason === 'other' ? explain : (document.getElementById('varianceReason').selectedOptions[0]?.text || reason),
        enteredBy: name,
        userEmail: (typeof auth !== 'undefined' && auth.currentUser?.email) || 'unknown',
        timestamp: new Date()
      };

      if (typeof db !== 'undefined') {
        db.collection('variance_logs').add(logEntry)
          .then(() => console.log('Variance logged:', logEntry))
          .catch(e => console.error('Failed to log variance:', e));
      }

      cleanup();
      resolve(true);
    }

    document.getElementById('varianceSubmitBtn').addEventListener('click', onSubmit);
    document.getElementById('varianceCancelBtn').addEventListener('click', onCancel);
  });
}
