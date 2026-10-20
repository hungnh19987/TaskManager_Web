<script lang="ts">
  let { form } = $props();
</script>

<svelte:head><title>Đổi mật khẩu | Task Manager</title></svelte:head>

<main>
  <a class="back" href="/">← Tổng quan</a>
  <section>
    <p class="eyebrow">BẢO MẬT TÀI KHOẢN</p>
    <h1>Đổi mật khẩu</h1>
    <p class="intro">
      Đổi mật khẩu sẽ đăng xuất tất cả phiên hiện có, bao gồm phiên này.
    </p>
    <form method="POST">
      <label for="currentPassword">Mật khẩu hiện tại</label>
      <input
        id="currentPassword"
        name="currentPassword"
        type="password"
        autocomplete="current-password"
        required
        maxlength="128"
      />
      <label for="newPassword">Mật khẩu mới</label>
      <input
        id="newPassword"
        name="newPassword"
        type="password"
        autocomplete="new-password"
        required
        minlength="12"
        maxlength="128"
      />
      <label for="confirmPassword">Xác nhận mật khẩu mới</label>
      <input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        autocomplete="new-password"
        required
        minlength="12"
        maxlength="128"
      />
      {#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
      <button type="submit">Cập nhật mật khẩu <span>→</span></button>
    </form>
  </section>
</main>

<style>
  main {
    max-width: 1060px;
    margin: 0 auto;
    padding: 44px 28px;
  }
  .back {
    color: #53635a;
    font-size: 13px;
    text-decoration: none;
  }
  section {
    width: min(100%, 520px);
    margin: 54px auto;
  }
  .eyebrow {
    color: #71863b;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.15em;
  }
  h1 {
    margin: 12px 0;
    font-family: Georgia, serif;
    font-size: 38px;
    font-weight: 400;
  }
  .intro {
    margin: 0 0 26px;
    color: #69736c;
    font-size: 14px;
    line-height: 1.6;
  }
  form {
    display: grid;
    gap: 10px;
  }
  label {
    margin-top: 8px;
    color: #45534a;
    font-size: 12px;
    font-weight: 600;
  }
  input {
    height: 44px;
    border: 1px solid #cfd5cc;
    border-radius: 0;
    background: #fff;
    padding: 0 12px;
    font: inherit;
  }
  input:focus {
    outline: 2px solid #71863b;
    outline-offset: 1px;
  }
  button {
    display: flex;
    height: 46px;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    border: 0;
    background: #24342b;
    padding: 0 14px;
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
  button span {
    color: #d2f36b;
  }
  .error {
    color: #9b3e32;
    font-size: 12px;
  }
</style>
