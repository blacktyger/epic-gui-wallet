/* Help topics (English), the source for every language: Settings › Help in the Modern interface. Task-based
 * topics for people new to Epic Cash; each opens with a one-line answer (short), the detail is behind a fold
 * (body). [[key]] is a place in the app, from terms. Facts as of 6.1.5: 3 confirmations, the default node is a
 * public one, nothing cancels by itself, no Tor, the wallet asks for no payment proofs. See topics.js. */
const messages = {
  ui: {
    lede: 'Short answers to common questions. Search, or open a topic.',
    search_label: 'Search help',
    search_placeholder: 'For example: file, confirmations, phrase',
    search_keys: 'Press / to search. Esc clears the search.',
    clear: 'Clear search',
    results: 'Topics found: {n}',
    no_results: 'No topic matches “{q}”. Try another word.',
    more: 'Read more',
    less: 'Show less',
    handshake: {
      title: 'How a transaction travels',
      over_epicbox: 'Over Epicbox',
      with_file: 'With a file',
      you: 'You',
      them: 'Them',
      network: 'Network',
      epicbox: 'Epicbox',
      file: 'File',
      step: 'Step {n} of {total}',
      prev: 'Previous step',
      next: 'Next step',
      steps: {
        epicbox: [
          'Your wallet sends the payment to Epicbox and locks the coins.',
          'Epicbox passes it on when their wallet is online. Their wallet adds its part and signs.',
          'Their wallet sends it back to Epicbox.',
          'Epicbox passes it back to your wallet.',
          'Your wallet signs too, finishes the transaction and sends it to the network.',
          'The network puts it in a block. After 3 confirmations it is final.',
        ],
        file: [
          'Your wallet saves a transaction file and locks the coins. You send the file to them yourself.',
          'They open it. Their wallet adds its part, signs and saves a response file.',
          'They send the response file back to you.',
          'You open the response file in your wallet.',
          'Your wallet signs too, finishes the transaction and sends it to the network.',
          'The network puts it in a block. After 3 confirmations it is final.',
        ],
      },
    },
  },

  //6.1.5 labels. feat/add-wallet-flow renames some: on merge, restore → "Restore from recovery phrase (on the first
  //screen, Unlock › Add a wallet, or Settings › All wallets › Add a wallet)" and wallet_files → "Settings › This
  //wallet › Wallet folder", in every language (its msg.wallets.* and modern.settings.nav_wallet strings).
  terms: {
    receive: 'Receive',
    send: 'Send',
    send_go: 'Review send, then Send … EPIC',
    send_file: 'Send as a file instead (at the top of Send)',
    sign_file: 'Receive › Transaction files › Sign a transaction file',
    finalize_file: 'Receive › Transaction files › Finalize a response file',
    cancel: 'Activity › the transaction › Cancel transaction',
    outputs: 'Activity › Outputs',
    phrase: 'Settings › Recovery phrase',
    rescan: 'Settings › Rescan',
    restore: 'Restore from recovery phrase (on the first screen, or Settings › Wallet › Add another wallet)',
    wallet_files: 'Settings › Wallet › Wallet files',
    node_settings: 'Settings › Node and receiving',
    epicbox_setting: 'Settings › Node and receiving › Receiving',
    report: 'Settings › Help › Report a problem',
    confirming_label: 'Confirming',
    locked_label: 'Locked in sends',
    awaiting_label: 'Awaiting finalization',
    fee_label: 'Network fee',
  },

  sections: [
    { id: 'start', title: 'Getting started' },
    { id: 'how', title: 'How Epic Cash works' },
    { id: 'safety', title: 'Keeping your wallet safe' },
    { id: 'network', title: 'Nodes and Epicbox' },
    { id: 'trouble', title: 'When something goes wrong' },
  ],

  topics: [
    {
      id: 'receive-first',
      section: 'start',
      title: 'Receive your first EPIC',
      short: 'Open [[receive]], copy your Epic address and give it to the sender. The payment arrives by itself.',
      body: `<p>Your Epic address is a long code that ends in <b>@</b> and the name of your Epicbox server, for example
        <b>…@epicbox.epiccash.com</b>. It is safe to share: people need it to pay you, and nobody can take anything with it.</p>
        <ol>
          <li>Open <b>[[receive]]</b>.</li>
          <li>Copy the address (or show its QR code) and send it to the person who pays you.</li>
          <li>The payment shows up in Activity on its own. You don't have to press anything.</li>
        </ol>
        <p>Your wallet starts receiving by itself after you unlock it, once the node is synced. If the wallet is closed when
        someone pays you, Epicbox holds the payment, and your wallet collects it the next time you unlock it.</p>
        <p>A new payment first waits for the sender's wallet to finish it, then shows as confirming. After 3 confirmations,
        about 3 minutes, you can spend it.</p>`,
    },
    {
      id: 'send',
      section: 'start',
      title: 'Send to someone',
      short: 'Open [[send]], paste their Epic address, enter the amount, check the fee and send.',
      body: `<ol>
          <li>Open <b>[[send]]</b> and paste the recipient's Epic address, or pick one of your contacts.</li>
          <li>Enter the amount. The fee is shown before you send.</li>
          <li>Press <b>[[send_go]]</b>.</li>
        </ol>
        <p>Now the recipient's wallet has to answer (see “Why does a transaction need both sides?”). Over Epicbox they don't
        have to be online right now: the payment waits until their wallet opens. While you wait, the coins it uses are locked
        in your wallet, so they can't be spent twice.</p>
        <p>When their answer comes back, your wallet finishes the transaction and sends it to the network by itself. It is
        final after 3 confirmations.</p>
        <p><b>No answer?</b> After a few minutes the status says “Waiting for the recipient's reply”. Ask them to open their
        wallet. If the answer never comes, cancel the send in <b>[[cancel]]</b> to unlock the coins. A send is never
        cancelled by itself.</p>
        <p>You can send once your node is synced. Sending to an Epic address also needs your own Epicbox to be connected;
        meanwhile you can send with a file. You can also send to an http(s) address, but then the recipient's wallet must be
        online and reachable at that moment.</p>`,
    },
    {
      id: 'send-file',
      section: 'start',
      title: 'Send with a file',
      short: 'The manual way: save a transaction file, pass it to the recipient, then open the response file they send back.',
      body: `<p>Files do the same handshake as Epicbox, but you carry the messages yourself, for example by email, chat or a
        USB stick. They work without Epicbox and without both of you being online at the same time.</p>
        <ol>
          <li><b>You:</b> in Send, enter the amount, press <b>[[send_file]]</b> and save the file (it ends in .tx). The
          coins are locked from now on.</li>
          <li><b>The recipient:</b> opens the file in <b>[[sign_file]]</b>. Their wallet signs it and saves a response file
          (its name starts with finalize_). They send that file back to you.</li>
          <li><b>You:</b> open the response file in <b>[[finalize_file]]</b>. Your wallet finishes the transaction and sends
          it to the network.</li>
        </ol>
        <p>Other Epic Cash wallets have their own names for these steps. If the response file never comes, cancel the send in
        <b>[[cancel]]</b> to unlock the coins.</p>`,
    },
    {
      id: 'both-sides',
      section: 'how',
      title: 'Why does a transaction need both sides?',
      short: 'In Epic Cash the receiver\'s wallet helps build every transaction, so both wallets must take part.',
      body: `<p>Epic Cash uses Mimblewimble. Instead of writing an address and an amount on the blockchain, the two wallets
        build each transaction together, like a handshake:</p>
        <ol>
          <li>Your wallet starts it and locks the coins you are sending.</li>
          <li>The receiver's wallet adds its part and signs.</li>
          <li>Your wallet signs too, finishes the transaction and sends it to the network.</li>
        </ol>
        <p>So something has to carry the messages between the two wallets. <b>Epicbox</b> does it for you: it holds the
        message while the other wallet is offline, so you don't both have to be online at the same moment. A
        <b>transaction file</b> is the manual way: you pass the files yourself.</p>`,
      visual: 'handshake',
    },
    {
      id: 'confirmations',
      section: 'how',
      title: 'Confirmations',
      short: 'A transaction is final after 3 confirmations, usually about 3 minutes.',
      body: `<p>When the network accepts a transaction, a miner puts it in a block. A new block comes about every minute. The
        block that holds your transaction is the first confirmation, and every block after it adds one more and makes the
        transaction harder to undo.</p>
        <p>This wallet treats a transaction as final after <b>3 confirmations</b>. Until then it shows as
        <b>[[confirming_label]]</b>, and coins you received can't be spent yet. The number is fixed.</p>
        <p>Taking longer than usual? Your wallet sees new blocks only through its node: check that the node is synced.</p>`,
    },
    {
      id: 'private',
      section: 'how',
      title: 'What the blockchain shows',
      short: 'No addresses and no amounts: only coin records the network can check without seeing who or how much.',
      body: `<p>On many blockchains anyone can look up an address and see its balance and history. Epic Cash is different:</p>
        <ul>
          <li><b>No addresses on the blockchain.</b> Your Epic address only tells Epicbox where to deliver messages. It is
          never written on the blockchain.</li>
          <li><b>No amounts on the blockchain.</b> Amounts are hidden with cryptography, and the network can still check that
          no coins were created out of nothing.</li>
          <li><b>Your notes stay off the blockchain.</b> A message you add goes only to the other wallet. Contacts and wallet
          names stay on this computer.</li>
        </ul>
        <p>What is not hidden: the node you use and your Epicbox server can see your IP address, and a public node can see
        which coins your wallet asks about. Use a VPN if the IP address matters to you.</p>`,
    },
    {
      id: 'change',
      section: 'how',
      title: 'Locked amounts and change',
      short: 'Your balance is made of separate coins. A send spends whole coins and returns the rest to you as change.',
      body: `<p>Your balance is a set of coins (also called outputs). To send 3 EPIC from a 5 EPIC coin, your wallet spends the
        whole coin: 3 EPIC go to the recipient, a small fee goes to the miners, and the rest comes back to you as a new coin,
        your <b>change</b> output.</p>
        <p>That is why part of your balance can be unavailable for a few minutes after a send:</p>
        <ul>
          <li><b>[[locked_label]]</b>: coins in a send that is not finished yet. They are unlocked if you cancel the send.</li>
          <li><b>[[awaiting_label]]</b>: a transaction that is still waiting for the other wallet.</li>
          <li><b>[[confirming_label]]</b>: coins in a block with fewer than 3 confirmations, including your change.</li>
        </ul>
        <p>You can see your coins in <b>[[outputs]]</b>.</p>`,
    },
    {
      id: 'fees',
      section: 'how',
      title: 'Fees',
      short: 'Every transaction pays a small network fee, shown before you send. It goes to the miners.',
      body: `<p>The fee depends on how many coins your transaction spends and creates, not on the amount. It is usually a small
        fraction of one EPIC.</p>
        <p>You see it as <b>[[fee_label]]</b> before you send.</p>
        <p><b>All</b>, next to the amount, fills in your whole spendable balance minus the exact fee, so no change is left.</p>`,
    },
    {
      id: 'phrase',
      section: 'safety',
      title: 'Your recovery phrase',
      short: 'These words are the only way to get your EPIC back. Write them on paper and never share them.',
      body: `<p>The recovery phrase (24 words for a new wallet) is the key to your money. With it you can restore your wallet on
        any computer, and anyone else who has it can take your EPIC.</p>
        <ul>
          <li>Write the words on paper, in this order, and keep the paper somewhere safe and offline.</li>
          <li>Never keep them as a photo, screenshot or file. Never type them into a website or a chat.</li>
          <li>Nobody from Epic Cash or this wallet will ever ask you for them.</li>
        </ul>
        <p>To see the words again, open <b>[[phrase]]</b> and enter your wallet password. Better not to copy them: if you do,
        the wallet clears the clipboard after 60 seconds, and when you lock or close the wallet.</p>`,
    },
    {
      id: 'backups',
      section: 'safety',
      title: 'Backups and restoring',
      short: 'Your recovery phrase is your backup. To restore a wallet, enter its words in Restore from recovery phrase.',
      body: `<p>There is no backup file to make: the recovery phrase brings back everything that is on the blockchain, which is
        your balance.</p>
        <p><b>To restore</b> on a new computer or after a loss: open <b>[[restore]]</b>, enter the words, check them and
        choose a password. When the wallet opens, it scans the blockchain for your coins. Your balance appears after that
        first scan.</p>
        <p><b>What a restore can't bring back:</b> what was never on the blockchain, such as transaction messages, contacts
        and wallet names.</p>
        <p><b>Balance looks wrong?</b> Run <b>[[rescan]]</b>. It scans the whole blockchain for the coins of this wallet.</p>
        <p><b>The wallet's files</b> are in <b>[[wallet_files]]</b>. Keep your recovery phrase even if you copy them: it
        works when the files are lost.</p>`,
    },
    {
      id: 'nodes',
      section: 'network',
      title: 'Nodes: built-in or external',
      short: 'A node connects your wallet to the Epic Cash network. A public node is quickest; the built-in one is your own.',
      body: `<p>The wallet needs a node to read the blockchain (your balance and confirmations) and to send your transactions to
        the network.</p>
        <ul>
          <li><b>External node</b> (the default): a public node, such as node.epiccash.com. It works right away. Whoever runs
          it can see your IP address and which coins your wallet asks about.</li>
          <li><b>Built-in node</b>: runs on this computer. It first downloads the whole blockchain, which takes a while and
          needs disk space, and then it is your own. While it syncs, the wallet uses a public node.</li>
        </ul>
        <p>Change it in <b>[[node_settings]]</b> and press Save. The wallet connects to the new node by itself. You can type a node's
        address or pick one of the public nodes, which are listed with their status.</p>
        <p>You can send only while the node is synced. If your node falls behind, the wallet offers to switch to another one.</p>`,
    },
    {
      id: 'epicbox',
      section: 'network',
      title: 'Epicbox',
      short: 'Epicbox delivers transactions between wallets and holds them while the other wallet is offline.',
      body: `<p>Both wallets take part in every transaction, so their messages need a meeting point. An Epicbox server is that
        meeting point: it holds a payment sent to you until your wallet comes online, and carries your wallet's answer back.
        The messages are encrypted, and Epicbox can't spend your coins.</p>
        <p>Your Epic address is your wallet's public key, then <b>@</b> and the name of your Epicbox server.</p>
        <p>The <b>Epicbox server</b> setting is in <b>[[epicbox_setting]]</b>. You can type a server or pick one of the
        public servers, which are listed with their status, then press Save. If you choose another server, the part after @ changes, so give
        your new address to the people who pay you. The wallet checks the old server once for payments sent to your old
        address. With the field empty, Epicbox is off and you can still use files.</p>
        <p>Other Epic Cash wallets use Epicbox too, so you can pay between them. Epicbox does not hide your IP address from
        the server: use a VPN if that matters to you.</p>`,
    },
    {
      id: 'troubleshooting',
      section: 'trouble',
      title: 'Troubleshooting',
      short: 'Most problems are a node that is still syncing, a recipient who hasn\'t answered yet, or a busy port.',
      body: `<p><b>“Node not synced”: I can't send.</b> Sending opens when your node has caught up. Wait a little, or choose
        another node in [[node_settings]].</p>
        <p><b>“Epicbox not connected”.</b> Your wallet can't reach its Epicbox server yet. Wait a moment. If it stays like
        this, check your internet connection or choose another server in [[epicbox_setting]]. Meanwhile you can send with a
        file.</p>
        <p><b>My send is “Waiting for the recipient's reply”.</b> The recipient's wallet hasn't answered yet. Ask them to
        open their wallet. If they never will, cancel the send in [[cancel]] to unlock the coins.</p>
        <p><b>A payment to me hasn't arrived.</b> Check in [[receive]] that receiving is on, and that your node is synced.
        If you changed your Epicbox server, make sure the sender used your new address. The sender's wallet also has to
        finish the transaction, then allow a few minutes for the confirmations.</p>
        <p><b>“Port 3415 is used by another program”.</b> Another program, often another Epic wallet, uses the port for HTTP
        payments. Close it, then press Try again in [[receive]]. Epicbox and files keep working meanwhile.</p>
        <p><b>“Another Epic program is using this folder”.</b> Another Epic wallet or node has the same files open. Close it
        and try again.</p>
        <p><b>“Wrong password”.</b> Check Caps Lock and the keyboard layout. If you have forgotten the password, restore the
        wallet from its recovery phrase and choose a new one.</p>
        <p><b>The balance looks wrong.</b> Run [[rescan]].</p>`,
    },
    {
      id: 'getting-help',
      section: 'trouble',
      title: 'Getting help',
      short: 'Something wrong? Open [[report]].',
      body: `<p>Your report is encrypted. Only the developer can read it.</p>`,
    },
  ],
};

export default messages
