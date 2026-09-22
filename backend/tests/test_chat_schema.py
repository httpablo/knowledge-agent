from schemas.chat import ChatRequest


def test_chat_request_schema_documents_conversation_id_usage() -> None:
    """Regression guard for the Swagger UUID confusion (F15).

    Without an explicit example, Swagger UI fills `conversation_id` with a
    fake placeholder UUID, making the first message look like it requires
    one. The schema must carry a first-message example that omits the field
    entirely, a follow-up example that shows how to reuse it, and a
    description explaining when to send it.
    """
    schema = ChatRequest.model_json_schema()

    examples = schema['examples']
    assert 'question' in examples[0]
    assert 'conversation_id' not in examples[0]
    assert any('conversation_id' in example for example in examples)

    assert schema['properties']['conversation_id']['description']
