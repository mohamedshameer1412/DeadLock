import os
from pathlib import Path
from slice.store import Store
from slice.retrieve import ingest

def test_deduplication_preserves_source_identity(tmp_path):
    store = Store(tmp_path / "test.db")
    
    # Create two different PDFs with some identical text to test identity
    import pymupdf
    pdf_a_path = tmp_path / "document_a.pdf"
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((50, 50), "This is a test document.")
    doc.save(pdf_a_path)
    doc.close()
    
    pdf_b_path = tmp_path / "document_b.pdf"
    doc2 = pymupdf.open()
    page2 = doc2.new_page()
    page2.insert_text((50, 50), "This is a test document.")
    page3 = doc2.new_page()
    page3.insert_text((50, 50), "This is page 2.")
    doc2.save(pdf_b_path)
    doc2.close()
    
    # Test 1: First indexing
    res1 = ingest(store, tmp_path, patterns=("*.pdf",))
    assert res1["chunks_created"] > 0
    assert res1["chunks_skipped_duplicate"] == 0
    assert res1["pages_with_text"] == 3
    assert res1["empty_pages"] == 0
    first_chunks_created = res1["chunks_created"]
    
    # Test 2: Second indexing (exact same folder)
    res2 = ingest(store, tmp_path, patterns=("*.pdf",))
    assert res2["chunks_created"] == 0
    assert res2["chunks_skipped_duplicate"] == first_chunks_created
    
    # Verify the database has separate records for document_a and document_b
    rows = store.db.execute("SELECT doc, ordinal, text FROM chunks ORDER BY doc, ordinal").fetchall()
    
    # Should have chunks for both document_a and document_b
    docs_found = set(r["doc"] for r in rows)
    assert "document_a.pdf" in docs_found
    assert "document_b.pdf" in docs_found
    
    # Test 6: Empty text is skipped properly
    pdf_c_path = tmp_path / "document_c_empty.pdf"
    doc3 = pymupdf.open()
    doc3.new_page() # blank page
    doc3.save(pdf_c_path)
    doc3.close()
    
    res3 = ingest(store, tmp_path, patterns=("document_c_empty.pdf",))
    assert res3["empty_pages"] == 1
    assert res3["chunks_created"] == 0
    assert res3["chunks_skipped_duplicate"] == 0
