import PyPDF2
with open('/Users/sac/wasm4pm/PHD_THESIS.pdf', 'rb') as f:
    pdf = PyPDF2.PdfReader(f)
    print("Total Pages:", len(pdf.pages))
