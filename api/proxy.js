export default async function handler(req, res) {
  try {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbw1JSmbnW4ELgSngqxL59_9hlGJ4e0MP_Ogl945w2aFFlmglgMJtvXcdrT5f_Wi3aL-/exec";

    const response = await fetch(GAS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.text();

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(data);

  } catch (error) {
    res.status(500).json({ ok:false, mensaje:"Error proxy" });
  }
}
