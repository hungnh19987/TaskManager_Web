<script lang="ts">
  let { form, data } = $props();
</script>

<svelte:head>
  <title>Đăng nhập | Task Manager</title>
  <meta
    name="description"
    content="Đăng nhập hệ thống quản lý giao việc nội bộ."
  />
</svelte:head>

<main>
  <a class="brand" href="/" aria-label="Task Manager">
    <span class="brand-mark">T</span><span>Task Manager</span>
  </a>
  <section aria-labelledby="title">
    <div class="eyebrow"><span></span> WORKSPACE NỘI BỘ</div>
    <h1 id="title">Chào mừng<br />trở <em>lại.</em></h1>
    <p class="subhead">Đăng nhập để tiếp tục công việc của bạn.</p>
    {#if data.passwordChanged}<p class="success" role="status">
        Mật khẩu đã đổi. Hãy đăng nhập lại.
      </p>{/if}
    <form method="POST">
      <label for="username">Tên đăng nhập</label>
      <input
        id="username"
        name="username"
        autocomplete="username"
        required
        maxlength="32"
      />
      <label for="password">Mật khẩu</label>
      <input
        id="password"
        name="password"
        type="password"
        autocomplete="current-password"
        required
        maxlength="128"
      />
      {#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
      <button type="submit">Đăng nhập <span aria-hidden="true">→</span></button>
    </form>
    <p class="security">Phiên đăng nhập được bảo vệ bằng cookie HttpOnly.</p>
  </section>
  <footer><span>INTERNAL OPERATIONS</span><span>AUTHENTICATION</span></footer>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    background: #f4f4f0;
    color: #202923;
    font-family: 'Avenir Next', Avenir, 'Segoe UI', sans-serif;
  }
  main {
    display: flex;
    min-height: 100vh;
    flex-direction: column;
    padding: 28px 7vw 0;
    background-image:
      linear-gradient(
        90deg,
        transparent 49.95%,
        rgba(32, 41, 35, 0.045) 50%,
        transparent 50.05%
      ),
      linear-gradient(rgba(32, 41, 35, 0.035) 1px, transparent 1px);
    background-size:
      100% 100%,
      100% 72px;
  }
  .brand {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 11px;
    color: inherit;
    font-size: 15px;
    font-weight: 700;
    text-decoration: none;
  }
  .brand-mark {
    display: grid;
    width: 29px;
    height: 29px;
    place-items: center;
    background: #d2f36b;
    font-family: Georgia, serif;
    font-size: 18px;
  }
  section {
    width: min(100%, 430px);
    margin: auto;
    padding: 64px 0 74px;
    animation: enter 0.45s ease-out both;
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #53635a;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.16em;
  }
  .eyebrow span {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #d2f36b;
  }
  h1 {
    margin: 22px 0 12px;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 62px;
    font-weight: 400;
    line-height: 0.98;
  }
  h1 em {
    color: #71863b;
    font-weight: 400;
  }
  .subhead {
    margin: 0 0 34px;
    color: #66716a;
    font-size: 14px;
  }
  form {
    display: grid;
    gap: 10px;
  }
  label {
    margin-top: 7px;
    color: #45534a;
    font-size: 12px;
    font-weight: 600;
  }
  input {
    width: 100%;
    height: 46px;
    border: 1px solid #cfd5cc;
    border-radius: 0;
    outline: none;
    background: rgba(255, 255, 255, 0.76);
    padding: 0 12px;
    color: #202923;
    font: inherit;
  }
  input:focus {
    border-color: #71863b;
    box-shadow: 0 0 0 2px rgba(113, 134, 59, 0.14);
  }
  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    margin-top: 14px;
    border: 0;
    background: #24342b;
    padding: 0 15px;
    color: white;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover {
    background: #41583d;
  }
  button span {
    color: #d2f36b;
    font-size: 19px;
  }
  .error {
    margin: 5px 0 0;
    color: #9b3e32;
    font-size: 12px;
  }
  .success {
    margin: -18px 0 18px;
    color: #3c754a;
    font-size: 12px;
  }
  .security {
    margin-top: 17px;
    color: #7b847d;
    font-size: 11px;
  }
  footer {
    display: flex;
    min-height: 58px;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid rgba(32, 41, 35, 0.15);
    color: #69736c;
    font-size: 9px;
    letter-spacing: 0.08em;
  }
  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (max-width: 520px) {
    main {
      padding: 22px 22px 0;
    }
    h1 {
      font-size: 54px;
    }
  }
</style>
